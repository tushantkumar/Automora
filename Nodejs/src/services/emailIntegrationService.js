import { google } from "googleapis";
import { createUserId } from "../utils/auth.js";
import { getUserBySessionToken } from "../db/authRepository.js";
import {
  getEmailIntegrationByProvider,
  deleteEmailIntegrationByProvider,
  listEmailIntegrationsByUserId,
  getInboxEmailByExternalId,
  listInboxEmailsByUserId,
  listInboxSentEmailsByReplyExternalId,
  markInboxEmailReplied,
  createInboxSentEmail,
  upsertEmailIntegration,
  upsertInboxEmails,
} from "../db/emailIntegrationRepository.js";
import { runAutomations } from "./automation/executionEngine.js";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
} from "../config/constants.js";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/userinfo.email",
];

const readBearerToken = (authHeader) =>
  String(authHeader || "").startsWith("Bearer ") ? String(authHeader).slice(7) : "";

const getAuthorizedUser = async (authHeader) => {
  const token = readBearerToken(authHeader);
  if (!token) return null;
  return getUserBySessionToken(token);
};

const encodeState = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
const decodeState = (value) => {
  try {
    return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
  } catch {
    return null;
  }
};


const createOAuth2Client = () => new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
);

const toIso = (value) => {
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const upsertRefreshedGmailTokens = async ({ userId, integration, credentials }) => {
  const nextAccessToken = String(credentials?.access_token || "").trim() || integration.access_token;
  const nextRefreshToken = String(credentials?.refresh_token || "").trim() || integration.refresh_token;
  const nextTokenExpiry = credentials?.expiry_date ? toIso(credentials.expiry_date) : integration.token_expiry;

  if (
    nextAccessToken !== integration.access_token
    || nextRefreshToken !== integration.refresh_token
    || String(nextTokenExpiry || "") !== String(integration.token_expiry || "")
  ) {
    await upsertEmailIntegration({
      userId,
      provider: "gmail",
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      tokenExpiry: nextTokenExpiry,
      connectedEmail: integration.connected_email || null,
    });
  }

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    tokenExpiry: nextTokenExpiry,
  };
};

const getAuthorizedGmailClient = async ({ userId, integration }) => {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: integration.access_token || undefined,
    refresh_token: integration.refresh_token || undefined,
    expiry_date: integration.token_expiry ? new Date(integration.token_expiry).getTime() : undefined,
  });

  const token = await oauth2Client.getAccessToken();
  if (!token?.token && !oauth2Client.credentials?.access_token) {
    throw new Error("Unable to obtain Gmail access token");
  }

  const persisted = await upsertRefreshedGmailTokens({ userId, integration, credentials: oauth2Client.credentials });
  oauth2Client.setCredentials({
    access_token: persisted.accessToken,
    refresh_token: persisted.refreshToken || undefined,
    expiry_date: persisted.tokenExpiry ? new Date(persisted.tokenExpiry).getTime() : undefined,
  });

  return {
    oauth2Client,
    accessToken: String(token?.token || persisted.accessToken || oauth2Client.credentials?.access_token || "").trim(),
  };
};

const encodeBase64Url = (value) =>
  Buffer.from(String(value || ""), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const buildRawEmail = ({ to, subject, bodyText, inReplyTo, references }) => {
  const safeTo = String(to || "").trim();
  const safeSubject = String(subject || "").trim() || "(no subject)";
  const safeBody = String(bodyText || "").trim();
  const safeInReplyTo = String(inReplyTo || "").trim();
  const safeReferences = String(references || "").trim();

  const headers = [
    `To: ${safeTo}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${safeSubject}`,
  ];

  if (safeInReplyTo) headers.push(`In-Reply-To: ${safeInReplyTo}`);
  if (safeReferences) headers.push(`References: ${safeReferences}`);

  return [...headers, "", safeBody].join("\r\n");
};

const getHeaderValue = (headers, name) => {
  const target = String(name || "").toLowerCase();
  const row = (Array.isArray(headers) ? headers : []).find((header) => String(header?.name || "").toLowerCase() === target);
  return String(row?.value || "").trim();
};

const fetchGmailReplyContext = async ({ accessToken, messageId }) => {
  if (!messageId) return null;

  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();
  if (!response.ok) return null;

  const headers = Array.isArray(data?.payload?.headers) ? data.payload.headers : [];
  return {
    threadId: String(data?.threadId || "").trim() || null,
    messageIdHeader: getHeaderValue(headers, "Message-ID") || null,
    referencesHeader: getHeaderValue(headers, "References") || null,
  };
};

const parseAddressHeader = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return { fromName: "", fromEmail: "" };

  const match = raw.match(/^(.*)<(.+)>$/);
  if (!match) return { fromName: raw, fromEmail: raw };

  return {
    fromName: String(match[1] || "").trim().replace(/^"|"$/g, ""),
    fromEmail: String(match[2] || "").trim(),
  };
};



const processedIncomingEmailIds = new Set();

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const triggerEmailReceivedWorkflowEvents = async ({ user, emails, ownerEmail = "", provider = "gmail" }) => {
  const rows = Array.isArray(emails) ? emails : [];
  const normalizedOwnerEmail = normalizeEmail(ownerEmail || user?.email || "");
  const executionResults = [];

  for (const email of rows) {
    const externalId = String(email?.externalId || "").trim();
    const senderEmail = normalizeEmail(email?.fromEmail);
    if (!externalId || processedIncomingEmailIds.has(`${user.id}:${externalId}`)) continue;
    if (normalizedOwnerEmail && senderEmail && senderEmail === normalizedOwnerEmail) continue;

    processedIncomingEmailIds.add(`${user.id}:${externalId}`);
    if (processedIncomingEmailIds.size > 5000) {
      const first = processedIncomingEmailIds.values().next().value;
      if (first) processedIncomingEmailIds.delete(first);
    }

    const messageBody = String(email?.snippet || "");

    const results = await runAutomations({
      triggerType: "Email Received",
      context: {
        user,
        email: {
          from: String(email?.fromEmail || "").trim(),
          subject: String(email?.subject || "(no subject)"),
          body: messageBody,
          attachments: [],
          externalId,
          fromName: String(email?.fromName || ""),
        },
      },
    });

    const sentResults = (Array.isArray(results) ? results : []).filter((item) => String(item?.result?.mode || "").toLowerCase() === "sent");
    const hasSentReply = sentResults.length > 0;

    for (const sentResult of sentResults) {
      await createInboxSentEmail({
        userId: user.id,
        provider,
        replyToExternalId: externalId,
        toEmail: String(sentResult?.result?.to || email?.fromEmail || "").trim(),
        subject: String(sentResult?.result?.subject || email?.subject || "(no subject)").trim(),
        snippet: String(sentResult?.result?.body || "").trim(),
      });
    }

    if (hasSentReply) {
      await markInboxEmailReplied({
        userId: user.id,
        provider,
        externalId,
      });
    }

    executionResults.push({ externalId, results, hasSentReply });
  }

  return executionResults;
};
const buildGmailAuthUrl = ({ token }) => {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES.join(" "),
    state: encodeState({ token }),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

const exchangeCodeForTokens = async (code) => {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens?.access_token) {
    throw new Error("Unable to complete Gmail authorization");
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_in: tokens.expiry_date ? Math.max(0, Math.round((Number(tokens.expiry_date) - Date.now()) / 1000)) : null,
    expiry_date: tokens.expiry_date || null,
  };
};

const fetchGmailProfile = async (oauth2Client) => {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const response = await gmail.users.getProfile({ userId: "me" });
  return response?.data || {};
};

const fetchGmailMessages = async (accessToken, maxResults = 50) => {
  const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=in%3Ainbox`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const listData = await listResponse.json();
  if (!listResponse.ok) throw new Error("Unable to list Gmail messages");

  const messages = Array.isArray(listData?.messages) ? listData.messages : [];
  const details = await Promise.all(
    messages.map(async (message) => {
      const detailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const detailData = await detailResponse.json();
      if (!detailResponse.ok) return null;

      const headers = Array.isArray(detailData?.payload?.headers) ? detailData.payload.headers : [];
      const fromHeader = headers.find((header) => header?.name === "From")?.value;
      const subject = headers.find((header) => header?.name === "Subject")?.value || "(no subject)";
      const dateHeader = headers.find((header) => header?.name === "Date")?.value;
      const parsedFrom = parseAddressHeader(fromHeader);
      const receivedAt = dateHeader ? new Date(dateHeader) : new Date();

      return {
        externalId: String(message.id),
        fromName: parsedFrom.fromName || parsedFrom.fromEmail || "Unknown sender",
        fromEmail: parsedFrom.fromEmail,
        subject: String(subject),
        snippet: String(detailData?.snippet || ""),
        receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date().toISOString() : receivedAt.toISOString(),
      };
    }),
  );

  return details.filter(Boolean);
};

const fetchGmailThreadMessages = async ({ accessToken, messageId, connectedEmail }) => {
  if (!messageId) return [];

  const detailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const detailData = await detailResponse.json();
  if (!detailResponse.ok) throw new Error("Unable to fetch email thread context");

  const threadId = String(detailData?.threadId || "").trim();
  if (!threadId) return [];

  const threadResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const threadData = await threadResponse.json();
  if (!threadResponse.ok) throw new Error("Unable to fetch email thread");

  const owner = String(connectedEmail || "").trim().toLowerCase();
  const rows = Array.isArray(threadData?.messages) ? threadData.messages : [];

  return rows.map((message) => {
    const headers = Array.isArray(message?.payload?.headers) ? message.payload.headers : [];
    const fromHeader = headers.find((header) => String(header?.name || "").toLowerCase() === "from")?.value;
    const toHeader = headers.find((header) => String(header?.name || "").toLowerCase() === "to")?.value;
    const subject = headers.find((header) => String(header?.name || "").toLowerCase() === "subject")?.value || "(no subject)";
    const dateHeader = headers.find((header) => String(header?.name || "").toLowerCase() === "date")?.value;
    const parsedFrom = parseAddressHeader(fromHeader);
    const receivedAt = dateHeader ? new Date(dateHeader) : new Date();
    const fromEmail = String(parsedFrom.fromEmail || "").toLowerCase();

    return {
      id: String(message?.id || ""),
      thread_id: threadId,
      from_name: parsedFrom.fromName || parsedFrom.fromEmail || "Unknown sender",
      from_email: parsedFrom.fromEmail || "",
      to: String(toHeader || ""),
      subject: String(subject),
      snippet: String(message?.snippet || ""),
      received_at: Number.isNaN(receivedAt.getTime()) ? new Date().toISOString() : receivedAt.toISOString(),
      direction: owner && fromEmail === owner ? "sent" : "received",
    };
  });
};


const mergeThreadMessages = ({ gmailMessages, localSentMessages, ownerEmail }) => {
  const owner = String(ownerEmail || "").trim();
  const sentRows = (Array.isArray(localSentMessages) ? localSentMessages : []).map((row) => ({
    id: `local-${String(row?.id || "")}`,
    thread_id: null,
    from_name: owner || "Auto-X",
    from_email: owner || "",
    to: String(row?.to_email || ""),
    subject: String(row?.subject || "(no subject)"),
    snippet: String(row?.snippet || ""),
    received_at: String(row?.sent_at || row?.created_at || new Date().toISOString()),
    direction: "sent",
  }));

  return [...(Array.isArray(gmailMessages) ? gmailMessages : []), ...sentRows]
    .filter((row) => row && row.id)
    .sort((a, b) => {
      const first = new Date(String(a?.received_at || 0)).getTime();
      const second = new Date(String(b?.received_at || 0)).getTime();
      return first - second;
    });
};

export const getEmailIntegrationStatus = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const integrations = await listEmailIntegrationsByUserId(user.id);
  const byProvider = new Map(integrations.map((row) => [row.provider, row]));

  return {
    status: 200,
    body: {
      integrations: {
        gmail: {
          connected: byProvider.has("gmail"),
          connectedEmail: byProvider.get("gmail")?.connected_email || null,
        },
        outlook: {
          connected: byProvider.has("outlook"),
          connectedEmail: byProvider.get("outlook")?.connected_email || null,
        },
      },
    },
  };
};

export const getGmailAuthorizationUrl = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    return { status: 400, body: { message: "Gmail integration is not configured on server" } };
  }

  const token = readBearerToken(authHeader);
  const authUrl = buildGmailAuthUrl({ token });
  return { status: 200, body: { authUrl } };
};

export const handleGmailCallback = async ({ code, state }) => {
  if (!code || !state) return { status: 400, body: { message: "Missing code/state" } };

  const decodedState = decodeState(state);
  const sessionToken = String(decodedState?.token || "").trim();
  if (!sessionToken) return { status: 400, body: { message: "Invalid state" } };

  const user = await getUserBySessionToken(sessionToken);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const tokenData = await exchangeCodeForTokens(code);
  const tokenExpiry = tokenData.expiry_date ? new Date(Number(tokenData.expiry_date)).toISOString() : null;
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || undefined,
    expiry_date: tokenData.expiry_date || undefined,
  });
  const profile = await fetchGmailProfile(oauth2Client);

  await upsertEmailIntegration({
    userId: user.id,
    provider: "gmail",
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    tokenExpiry,
    connectedEmail: profile?.emailAddress || null,
  });

  const emails = await fetchGmailMessages(tokenData.access_token, 50);
  const normalizedEmails = emails.map((email) => ({ ...email, externalId: email.externalId || createUserId() }));
  await upsertInboxEmails({ userId: user.id, provider: "gmail", emails: normalizedEmails });
  await triggerEmailReceivedWorkflowEvents({ user, emails: normalizedEmails, ownerEmail: profile?.emailAddress || "", provider: "gmail" });

  return {
    status: 200,
    body: {
      message: "Gmail connected successfully",
      syncedEmails: normalizedEmails.length,
    },
  };
};

export const syncGmailEmails = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const integration = await getEmailIntegrationByProvider({ userId: user.id, provider: "gmail" });
  if (!integration?.access_token) {
    return { status: 404, body: { message: "Gmail is not connected" } };
  }

  try {
    const { accessToken } = await getAuthorizedGmailClient({ userId: user.id, integration });
    const emails = await fetchGmailMessages(accessToken, 50);
    const normalizedEmails = emails.map((email) => ({ ...email, externalId: email.externalId || createUserId() }));
    await upsertInboxEmails({ userId: user.id, provider: "gmail", emails: normalizedEmails });
    await triggerEmailReceivedWorkflowEvents({ user, emails: normalizedEmails, ownerEmail: integration.connected_email || "", provider: "gmail" });

    return { status: 200, body: { message: "Emails synced", syncedEmails: normalizedEmails.length } };
  } catch {
    return { status: 502, body: { message: "Unable to sync emails from Gmail. Please reconnect." } };
  }
};

export const getInboxEmails = async (authHeader, query = {}) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const emails = await listInboxEmailsByUserId({
    userId: user.id,
    search: String(query.search || "").trim(),
  });

  return { status: 200, body: { emails } };
};

export const getInboxThread = async (authHeader, externalId = "") => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const messageId = String(externalId || "").trim();
  if (!messageId) return { status: 400, body: { message: "Missing email id" } };

  const integration = await getEmailIntegrationByProvider({ userId: user.id, provider: "gmail" });
  if (!integration?.access_token) return { status: 404, body: { message: "Gmail is not connected" } };

  const localSentMessages = await listInboxSentEmailsByReplyExternalId({
    userId: user.id,
    provider: "gmail",
    replyToExternalId: messageId,
  });

  try {
    const { accessToken } = await getAuthorizedGmailClient({ userId: user.id, integration });
    const threadMessages = await fetchGmailThreadMessages({
      accessToken,
      messageId,
      connectedEmail: integration.connected_email || "",
    });

    return {
      status: 200,
      body: {
        messages: mergeThreadMessages({
          gmailMessages: threadMessages,
          localSentMessages,
          ownerEmail: integration.connected_email || "",
        }),
      },
    };
  } catch {
    if (localSentMessages.length > 0) {
      return {
        status: 200,
        body: {
          messages: mergeThreadMessages({
            gmailMessages: [],
            localSentMessages,
            ownerEmail: integration.connected_email || "",
          }),
        },
      };
    }

    return { status: 502, body: { message: "Unable to load email thread" } };
  }
};

export const sendGmailEmail = async (authHeader, payload = {}) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const integration = await getEmailIntegrationByProvider({ userId: user.id, provider: "gmail" });
  if (!integration?.access_token) {
    return { status: 404, body: { message: "Gmail is not connected" } };
  }

  const to = String(payload.to || "").trim();
  const subject = String(payload.subject || "").trim();
  const bodyText = String(payload.body || "").trim();
  const replyToExternalId = String(payload.replyToExternalId || "").trim();

  if (!to || !bodyText) {
    return { status: 400, body: { message: "Recipient and message body are required" } };
  }

  if (replyToExternalId) {
    const inboxEmail = await getInboxEmailByExternalId({
      userId: user.id,
      provider: "gmail",
      externalId: replyToExternalId,
    });

    if (!inboxEmail) {
      return { status: 404, body: { message: "Original inbox email not found" } };
    }

    if (inboxEmail.replied_at) {
      return { status: 409, body: { message: "Reply already sent for this email" } };
    }
  }

  try {
    const { oauth2Client, accessToken } = await getAuthorizedGmailClient({ userId: user.id, integration });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const profile = await fetchGmailProfile(oauth2Client);
    const connectedEmail = String(integration.connected_email || "").trim().toLowerCase();
    const senderEmail = String(profile?.emailAddress || "").trim().toLowerCase();
    if (connectedEmail && senderEmail && connectedEmail !== senderEmail) {
      return { status: 409, body: { message: "Connected Gmail account changed. Please reconnect Gmail." } };
    }

    const replyContext = await fetchGmailReplyContext({
      accessToken,
      messageId: replyToExternalId,
    });

    const inReplyTo = replyContext?.messageIdHeader || "";
    const references = [replyContext?.referencesHeader, replyContext?.messageIdHeader].filter(Boolean).join(" ").trim();
    const raw = encodeBase64Url(buildRawEmail({ to, subject, bodyText, inReplyTo, references }));

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        ...(replyContext?.threadId ? { threadId: replyContext.threadId } : {}),
      },
    });

    if (replyToExternalId) {
      await createInboxSentEmail({
        userId: user.id,
        provider: "gmail",
        replyToExternalId,
        toEmail: to,
        subject,
        snippet: bodyText,
      });

      await markInboxEmailReplied({
        userId: user.id,
        provider: "gmail",
        externalId: replyToExternalId,
      });
    }

    return {
      status: 200,
      body: {
        message: "Email sent successfully",
        gmailMessageId: String(response?.data?.id || "") || null,
        senderEmail: String(profile?.emailAddress || integration.connected_email || "") || null,
      },
    };
  } catch {
    return { status: 502, body: { message: "Unable to send email via connected Gmail account" } };
  }
};


export const disconnectEmailIntegration = async (authHeader, provider = "") => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const normalizedProvider = String(provider || "").trim().toLowerCase();
  if (!["gmail", "outlook"].includes(normalizedProvider)) {
    return { status: 400, body: { message: "Unsupported provider" } };
  }

  const deleted = await deleteEmailIntegrationByProvider({ userId: user.id, provider: normalizedProvider });
  if (!deleted) {
    return { status: 404, body: { message: `${normalizedProvider} is not connected` } };
  }

  return { status: 200, body: { message: `${normalizedProvider} disconnected successfully` } };
};


export const getInboxAiReply = async (authHeader, payload = {}) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const inputText = String(payload.inputText || "").trim();
  if (!inputText) {
    return { status: 400, body: { message: "inputText is required" } };
  }

  const prompt = `You are a professional email assistant.
Write a concise, polite business reply to the following context.

${inputText}`;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { status: response.status, body: { message: data?.error || "Ollama request failed" } };
    }

    const content = String(data?.response || "").trim();
    if (!content) {
      return { status: 502, body: { message: "Empty AI response" } };
    }

    return { status: 200, body: { reply: content } };
  } catch {
    return { status: 502, body: { message: "Error fetching from Ollama" } };
  }
};

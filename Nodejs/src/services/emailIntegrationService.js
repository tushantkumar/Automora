import { createUserId } from "../utils/auth.js";
import { getUserBySessionToken } from "../db/authRepository.js";
import {
  getEmailIntegrationByProvider,
  deleteEmailIntegrationByProvider,
  listEmailIntegrationsByUserId,
  getInboxEmailByExternalId,
  listInboxEmailsByUserId,
  markInboxEmailReplied,
  updateInboxEmailClassification,
  upsertEmailIntegration,
  upsertInboxEmails,
} from "../db/emailIntegrationRepository.js";
import { runAutomations } from "./automation/executionEngine.js";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
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

const EMAIL_CATEGORIES = ["INVOICE", "QUERY", "SUPPORT", "CUSTOMER", "OTHER"];

const classifyEmailWithOllama = async (emailBody) => {
  const prompt = `You are an email classification assistant.

Classify this email into ONE of the following:
- INVOICE
- QUERY
- SUPPORT
- CUSTOMER
- OTHER

Return ONLY the category name.
Also return confidence percentage.

Email Content:
${String(emailBody || "")}

Return JSON:
{
  "category": "...",
  "confidence": 0.92
}`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: "json",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Ollama classification failed");
  }

  const raw = String(data?.response || "").trim();
  const parsed = JSON.parse(raw || "{}");
  const category = String(parsed?.category || "").trim().toUpperCase();
  const confidenceRaw = Number(parsed?.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;

  return {
    category: EMAIL_CATEGORIES.includes(category) ? category : "OTHER",
    confidence,
  };
};

const classifyAndPersistInboxEmails = async ({ userId, provider, emails }) => {
  for (const email of Array.isArray(emails) ? emails : []) {
    const externalId = String(email?.externalId || "").trim();
    if (!externalId) continue;

    try {
      const classification = await classifyEmailWithOllama(String(email?.snippet || ""));
      await updateInboxEmailClassification({
        userId,
        provider,
        externalId,
        category: classification.category,
        confidenceScore: classification.confidence,
      });
    } catch {
      await updateInboxEmailClassification({
        userId,
        provider,
        externalId,
        category: "OTHER",
        confidenceScore: 0,
      });
    }
  }
};

const triggerEmailReceivedWorkflowEvents = async ({ user, emails, ownerEmail = "" }) => {
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

    executionResults.push({ externalId, results });
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
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const data = await response.json();
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "Unable to complete Gmail authorization");
  }

  return data;
};

const fetchGmailProfile = async (accessToken) => {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();
  if (!response.ok) throw new Error("Unable to fetch Gmail profile");
  return data;
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
  const profile = await fetchGmailProfile(tokenData.access_token);
  const expiryMs = Number(tokenData.expires_in || 0) * 1000;
  const tokenExpiry = expiryMs > 0 ? new Date(Date.now() + expiryMs).toISOString() : null;

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
  await classifyAndPersistInboxEmails({ userId: user.id, provider: "gmail", emails: normalizedEmails });
  await triggerEmailReceivedWorkflowEvents({ user, emails: normalizedEmails, ownerEmail: profile?.emailAddress || "" });

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
    const emails = await fetchGmailMessages(integration.access_token, 50);
    const normalizedEmails = emails.map((email) => ({ ...email, externalId: email.externalId || createUserId() }));
    await upsertInboxEmails({ userId: user.id, provider: "gmail", emails: normalizedEmails });
    await classifyAndPersistInboxEmails({ userId: user.id, provider: "gmail", emails: normalizedEmails });
    await triggerEmailReceivedWorkflowEvents({ user, emails: normalizedEmails, ownerEmail: integration.connected_email || "" });

    return { status: 200, body: { message: "Emails synced", syncedEmails: normalizedEmails.length } };
  } catch {
    return { status: 502, body: { message: "Unable to sync emails from Gmail. Please reconnect." } };
  }
};

export const getInboxEmails = async (authHeader, query = {}) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const category = String(query.category || "").trim().toUpperCase();
  const emails = await listInboxEmailsByUserId({
    userId: user.id,
    search: String(query.search || "").trim(),
    category: EMAIL_CATEGORIES.includes(category) ? category : "",
  });

  return { status: 200, body: { emails, categories: EMAIL_CATEGORIES } };
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
  const messageIdHeader = getHeaderValue(headers, "Message-ID");
  const referencesHeader = getHeaderValue(headers, "References");

  return {
    threadId: String(data?.threadId || "").trim() || null,
    messageIdHeader: messageIdHeader || null,
    referencesHeader: referencesHeader || null,
  };
};



export const getInboxThread = async (authHeader, externalId = "") => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const messageId = String(externalId || "").trim();
  if (!messageId) return { status: 400, body: { message: "Missing email id" } };

  const integration = await getEmailIntegrationByProvider({ userId: user.id, provider: "gmail" });
  if (!integration?.access_token) return { status: 404, body: { message: "Gmail is not connected" } };

  try {
    const threadMessages = await fetchGmailThreadMessages({
      accessToken: integration.access_token,
      messageId,
      connectedEmail: integration.connected_email || "",
    });

    return { status: 200, body: { messages: threadMessages } };
  } catch {
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
    const replyContext = await fetchGmailReplyContext({
      accessToken: integration.access_token,
      messageId: replyToExternalId,
    });

    const inReplyTo = replyContext?.messageIdHeader || "";
    const references = [replyContext?.referencesHeader, replyContext?.messageIdHeader].filter(Boolean).join(" ").trim();
    const raw = encodeBase64Url(buildRawEmail({ to, subject, bodyText, inReplyTo, references }));

    const sendBody = {
      raw,
      ...(replyContext?.threadId ? { threadId: replyContext.threadId } : {}),
    };

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendBody),
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || "Unable to send email via Gmail";
      return { status: 502, body: { message } };
    }

    if (replyToExternalId) {
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
        gmailMessageId: data?.id || null,
      },
    };
  } catch {
    return { status: 502, body: { message: "Unable to send email via Gmail" } };
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

  if (!OPENROUTER_API_KEY) {
    return { status: 400, body: { message: "OpenRouter API key is not configured" } };
  }

  const inputText = String(payload.inputText || "").trim();
  if (!inputText) {
    return { status: 400, body: { message: "inputText is required" } };
  }

  const requestPayload = {
    model: OPENROUTER_MODEL,
    messages: [{ role: "user", content: inputText }],
    reasoning: { enabled: true },
  };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });

    const data = await response.json();
    if (!response.ok) {
      return { status: response.status, body: { message: data?.error?.message || "OpenRouter request failed" } };
    }

    const content = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!content) {
      return { status: 502, body: { message: "Empty AI response" } };
    }

    return { status: 200, body: { reply: content } };
  } catch {
    return { status: 502, body: { message: "Error fetching from OpenRouter API" } };
  }
};

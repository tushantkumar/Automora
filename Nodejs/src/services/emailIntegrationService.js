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
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  IMAP_HOST,
  IMAP_PORT,
  IMAP_SECURE,
  IMAP_USER,
  IMAP_PASS,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_TLS,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
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

const loadImapDependencies = async () => {
  const [{ ImapFlow }, { simpleParser }] = await Promise.all([
    import("imapflow"),
    import("mailparser"),
  ]);
  return { ImapFlow, simpleParser };
};

const loadNodemailer = async () => {
  const mod = await import("nodemailer");
  return mod.default || mod;
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

const normalizeFolderName = (value) => {
  const folder = String(value || "INBOX").trim().toUpperCase();
  if (["INBOX", "SENT", "DRAFT", "DRAFTS", "TRASH"].includes(folder)) {
    if (folder === "DRAFT") return "DRAFTS";
    return folder;
  }
  return "INBOX";
};

const fetchImapMessages = async ({ folder, search = "", page = 1, pageSize = 20, credentials = {} }) => {
  const { ImapFlow, simpleParser } = await loadImapDependencies();
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: { user: credentials.user, pass: credentials.pass },
  });

  await client.connect();

  try {
    const mailbox = normalizeFolderName(folder);
    const lock = await client.getMailboxLock(mailbox === "INBOX" ? "INBOX" : mailbox);

    try {
      const allUids = [];
      for await (const msg of client.fetch("1:*", { uid: true })) {
        allUids.push(Number(msg.uid));
      }

      const sorted = allUids.sort((a, b) => b - a);
      const offset = (Math.max(page, 1) - 1) * Math.max(pageSize, 1);
      const target = sorted.slice(offset, offset + Math.max(pageSize, 1));

      const emails = [];
      for (const uid of target) {
        for await (const msg of client.fetch(String(uid), { uid: true, envelope: true, source: true, internalDate: true })) {
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.value?.[0];
          const text = String(parsed.text || parsed.html || "").trim();
          emails.push({
            externalId: `${mailbox}-${msg.uid}`,
            fromName: from?.name || from?.address || "Unknown sender",
            fromEmail: from?.address || "",
            subject: String(parsed.subject || msg.envelope?.subject || "(no subject)"),
            snippet: text.slice(0, 2000),
            folder: mailbox,
            receivedAt: (msg.internalDate || new Date()).toISOString(),
          });
        }
      }

      const filtered = search
        ? emails.filter((email) => {
            const q = String(search).toLowerCase();
            return [email.subject, email.fromName, email.fromEmail, email.snippet].join(" ").toLowerCase().includes(q);
          })
        : emails;

      return { emails: filtered, total: sorted.length };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
};

const fetchGmailMessagesViaImapOAuth = async ({ accessToken, connectedEmail, maxResults = 50 }) => {
  const { ImapFlow, simpleParser } = await loadImapDependencies();

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: String(connectedEmail || "").trim(),
      accessToken,
    },
  });

  await client.connect();

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = [];
      for await (const msg of client.fetch("1:*", { uid: true })) {
        uids.push(Number(msg.uid));
      }

      const targetUids = uids
        .sort((a, b) => b - a)
        .slice(0, Math.max(Number(maxResults || 50), 1));

      const emails = [];
      for (const uid of targetUids) {
        for await (const msg of client.fetch(String(uid), { uid: true, source: true, envelope: true, internalDate: true })) {
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.value?.[0];
          const body = String(parsed.text || parsed.html || "").trim();

          emails.push({
            externalId: String(msg.uid),
            fromName: from?.name || from?.address || "Unknown sender",
            fromEmail: from?.address || "",
            subject: String(parsed.subject || msg.envelope?.subject || "(no subject)"),
            snippet: body.slice(0, 2000),
            folder: "INBOX",
            receivedAt: (msg.internalDate || new Date()).toISOString(),
          });
        }
      }

      return emails;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
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

  const emails = await fetchGmailMessagesViaImapOAuth({
    accessToken: tokenData.access_token,
    connectedEmail: profile?.emailAddress || "",
    maxResults: 50,
  });
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
    const emails = await fetchGmailMessagesViaImapOAuth({
      accessToken: integration.access_token,
      connectedEmail: integration.connected_email || "",
      maxResults: 50,
    });
    const normalizedEmails = emails.map((email) => ({ ...email, externalId: email.externalId || createUserId() }));
    await upsertInboxEmails({ userId: user.id, provider: "gmail", emails: normalizedEmails });
    await classifyAndPersistInboxEmails({ userId: user.id, provider: "gmail", emails: normalizedEmails });
    await triggerEmailReceivedWorkflowEvents({ user, emails: normalizedEmails, ownerEmail: integration.connected_email || "" });

    return { status: 200, body: { message: "Emails synced", syncedEmails: normalizedEmails.length } };
  } catch {
    return { status: 502, body: { message: "Unable to sync emails from Gmail. Please reconnect." } };
  }
};

export const syncImapEmails = async (authHeader, payload = {}) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const page = Math.max(Number(payload.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(payload.pageSize || 20), 1), 100);
  const folder = normalizeFolderName(payload.folder || "INBOX");
  const search = String(payload.search || "").trim();

  const credentials = {
    host: String(payload.imapHost || IMAP_HOST || "").trim(),
    port: Number(payload.imapPort || IMAP_PORT || 993),
    secure: payload.imapSecure == null ? IMAP_SECURE : Boolean(payload.imapSecure),
    user: String(payload.imapUser || IMAP_USER || user.email || "").trim(),
    pass: String(payload.imapPass || IMAP_PASS || "").trim(),
  };

  if (!credentials.host || !credentials.user || !credentials.pass) {
    return { status: 400, body: { message: "IMAP credentials are required" } };
  }

  try {
    const { emails, total } = await fetchImapMessages({ folder, search, page, pageSize, credentials });
    await upsertInboxEmails({ userId: user.id, provider: "imap", emails });

    return {
      status: 200,
      body: {
        message: "IMAP sync successful",
        syncedEmails: emails.length,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(Math.ceil(total / pageSize), 1),
        },
      },
    };
  } catch (error) {
    return { status: 502, body: { message: String(error?.message || "Unable to sync IMAP emails") } };
  }
};

export const getInboxEmails = async (authHeader, query = {}) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize || 20), 1), 100);
  const category = String(query.category || "").trim().toUpperCase();
  const folder = normalizeFolderName(String(query.folder || "INBOX").trim());
  const { rows, total } = await listInboxEmailsByUserId({
    userId: user.id,
    search: String(query.search || "").trim(),
    category: EMAIL_CATEGORIES.includes(category) ? category : "",
    folder,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return {
    status: 200,
    body: {
      emails: rows,
      categories: EMAIL_CATEGORIES,
      folders: ["INBOX", "SENT", "DRAFTS", "TRASH"],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    },
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

  const transportType = String(payload.transport || "gmail").trim().toLowerCase();

  if (transportType === "smtp") {
    try {
      const nodemailer = await loadNodemailer();
      const transporter = nodemailer.createTransport({
        host: String(payload.smtpHost || SMTP_HOST || "").trim(),
        port: Number(payload.smtpPort || SMTP_PORT || 587),
        secure: payload.smtpSecure == null ? SMTP_TLS : Boolean(payload.smtpSecure),
        auth: {
          user: String(payload.smtpUser || SMTP_USER || "").trim(),
          pass: String(payload.smtpPass || SMTP_PASS || "").trim(),
        },
      });

      await transporter.sendMail({
        from: String(payload.from || SMTP_FROM || payload.smtpUser || SMTP_USER || "").trim(),
        to,
        subject: subject || "(no subject)",
        text: bodyText,
      });

      return { status: 200, body: { message: "Email sent successfully", transport: "smtp" } };
    } catch (error) {
      return { status: 502, body: { message: String(error?.message || "Unable to send email via SMTP") } };
    }
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

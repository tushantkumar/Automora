import { google } from "googleapis";
import PDFDocument from "pdfkit";
import { getMailTemplateById } from "../../db/mailTemplateRepository.js";
import { createCustomer, getCustomerByEmail, updateCustomerById } from "../../db/customerRepository.js";
import {
  createInvoice,
  getInvoiceByNumberForUser,
  getInvoiceWithCustomerByIdForAutomation,
  getLatestInvoiceForCustomerEmail,
  updateInvoiceById,
} from "../../db/invoiceRepository.js";
import { createUserId, normalizeEmail } from "../../utils/auth.js";
import { classifyIncomingEmail, generateAutomationContent } from "./aiService.js";
import { buildAutomationEmailLayout } from "./emailLayout.js";
import { getEffectiveSystemSettingsByUserId } from "../systemSettingsService.js";
import { createDraftEmail } from "../../db/draftEmailRepository.js";
import { getEmailIntegrationByProvider, upsertEmailIntegration } from "../../db/emailIntegrationRepository.js";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from "../../config/constants.js";

const legacyTokenMap = {
  customerName: "customer.name",
  customerEmail: "customer.email",
  invoiceNumber: "invoice.invoice_number",
  invoiceStatus: "invoice.status",
  invoiceAmount: "invoice.amount",
  dueDate: "invoice.due_date",
  emailSubject: "email.subject",
  emailBody: "email.body",
  organizationName: "user.organization_name",
};

const getByPath = (obj, path) => String(path || "")
  .split(".")
  .reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), obj);

const interpolateTemplate = (template, context) =>
  String(template || "").replace(/{{\s*([\w.]+)\s*}}/g, (_, token) => {
    const mapped = legacyTokenMap[token] || token;
    const value = getByPath(context, mapped);
    return value == null ? "" : String(value);
  });

const toParagraphHtml = (text) => `<p style="margin:0 0 16px;">${String(text || "").split("\n").join("<br/>")}</p>`;

const toCurrency = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
};

const parseInvoiceLineItems = (lineItems) => {
  if (Array.isArray(lineItems)) return lineItems;

  const raw = String(lineItems || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildAutomationInvoicePdfBuffer = async (invoice) => {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const invoiceNumber = String(invoice?.invoice_number || invoice?.id || "-");
  const customerName = String(invoice?.customer_name || invoice?.client_name || "-");
  const customerEmail = String(invoice?.customer_email || "-");
  const issueDate = String(invoice?.issue_date || "").slice(0, 10) || "-";
  const dueDate = String(invoice?.due_date || "").slice(0, 10) || "-";
  const status = String(invoice?.status || "-");
  const amount = toCurrency(invoice?.amount);
  const taxRate = `${Number(invoice?.tax_rate || 0).toFixed(2)}%`;

  let y = 40;
  doc.roundedRect(40, y, 515, 76, 12).fillAndStroke("#f5f3ff", "#ddd6fe");
  doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(24).text("INVOICE", 56, y + 18);
  doc.fillColor("#6d28d9").font("Helvetica").fontSize(11).text(`Invoice #${invoiceNumber}`, 56, y + 50);
  doc.fillColor("#1f2937").font("Helvetica").fontSize(11).text(`Generated: ${new Date().toLocaleDateString()}`, 420, y + 24, { align: "right", width: 120 });

  y += 96;
  doc.roundedRect(40, y, 250, 122, 10).fillAndStroke("#ffffff", "#e5e7eb");
  doc.fillColor("#6b7280").font("Helvetica-Bold").fontSize(10).text("BILLED TO", 54, y + 14);
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(12).text(customerName, 54, y + 34, { width: 220 });
  doc.fillColor("#374151").font("Helvetica").fontSize(10).text(customerEmail, 54, y + 56, { width: 220 });

  doc.roundedRect(305, y, 250, 122, 10).fillAndStroke("#ffffff", "#e5e7eb");
  doc.fillColor("#6b7280").font("Helvetica-Bold").fontSize(10).text("INVOICE DETAILS", 319, y + 14);
  doc.fillColor("#111827").font("Helvetica").fontSize(10);
  doc.text(`Issue Date: ${issueDate}`, 319, y + 34);
  doc.text(`Due Date: ${dueDate}`, 319, y + 50);
  doc.text(`Status: ${status}`, 319, y + 66);
  doc.text(`Tax: ${taxRate}`, 319, y + 82);
  doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(12).text(`Total: ${amount}`, 319, y + 100);

  y += 142;
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(12).text("Line Items", 40, y);
  y += 20;

  doc.roundedRect(40, y, 515, 26, 6).fillAndStroke("#ede9fe", "#ddd6fe");
  doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(9);
  doc.text("Description", 52, y + 8, { width: 260 });
  doc.text("Qty", 330, y + 8, { width: 60, align: "right" });
  doc.text("Rate", 395, y + 8, { width: 70, align: "right" });
  doc.text("Total", 470, y + 8, { width: 70, align: "right" });
  y += 30;

  const lineItems = parseInvoiceLineItems(invoice?.line_items);
  const rows = lineItems.length > 0 ? lineItems : [{ description: "Invoice Amount", quantity: 1, rate: Number(invoice?.amount || 0) }];

  rows.forEach((item) => {
    if (y > 760) {
      doc.addPage();
      y = 48;
    }

    const qty = Number(item?.quantity || 0);
    const rate = Number(item?.rate || 0);
    const total = qty * rate;

    doc.roundedRect(40, y, 515, 24, 5).fillAndStroke("#ffffff", "#e5e7eb");
    doc.fillColor("#111827").font("Helvetica").fontSize(9);
    doc.text(String(item?.description || "-"), 52, y + 7, { width: 260 });
    doc.text(String(qty), 330, y + 7, { width: 60, align: "right" });
    doc.text(toCurrency(rate), 395, y + 7, { width: 70, align: "right" });
    doc.text(toCurrency(total), 470, y + 7, { width: 70, align: "right" });
    y += 28;
  });

  y += 10;
  doc.roundedRect(340, y, 215, 34, 8).fillAndStroke("#f5f3ff", "#ddd6fe");
  doc.fillColor("#4c1d95").font("Helvetica-Bold").fontSize(12).text(`Grand Total: ${amount}`, 355, y + 11);

  doc.end();
  return done;
};

const resolveRecipient = (context) => {
  const candidates = [
    context?.email?.from,
    context?.customer?.email,
    context?.invoice?.customer_email,
    context?.invoice?.customerEmail,
  ];

  return candidates.find((value) => String(value || "").includes("@")) || "";
};

const extractInvoiceNumber = (text) => {
  const value = String(text || "");
  const regex = /invoice\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Za-z0-9-]+)/i;
  const match = value.match(regex);
  return match?.[1] || "";
};

const validateMailTemplate = async ({ automation, userId }) => {
  if (!automation.mail_template_id) {
    throw new Error("Mail template is required for this automation action");
  }

  const template = await getMailTemplateById({ templateId: automation.mail_template_id, userId });
  if (!template) throw new Error("Mail template not found");

  const subject = String(template.subject || "").trim();
  const body = String(template.body || "").trim();
  if (!subject) throw new Error("Mail template subject is empty");
  if (!body) throw new Error("Mail template body is empty");

  return { template, subject, body };
};

const resolveInvoiceDetails = async ({ automation, userId, context }) => {
  const invoiceRelated = automation.trigger_type === "Invoice" || automation.action_type === "Invoice";
  const invoiceId = String(context?.invoice?.id || "").trim();

  if (invoiceId) {
    const invoice = await getInvoiceWithCustomerByIdForAutomation({ userId, invoiceId });
    if (invoice) return invoice;
  }

  if (context?.invoice) {
    return context.invoice;
  }

  if (invoiceRelated) {
    throw new Error("Invoice email requires invoice context");
  }

  return null;
};

const renderTemplateEmail = async ({ automation, userId, context, bodyTextOverride = null }) => {
  const { subject: templateSubject, body: templateBody } = await validateMailTemplate({ automation, userId });

  const invoice = await resolveInvoiceDetails({ automation, userId, context });
  const renderContext = {
    ...context,
    invoice: invoice || context?.invoice || null,
    customer: context?.customer || {
      name: invoice?.customer_name,
      email: invoice?.customer_email,
      contact: invoice?.customer_contact,
      client: invoice?.customer_client,
      status: invoice?.customer_status,
      value: invoice?.customer_value,
    },
  };

  const subject = interpolateTemplate(templateSubject, renderContext);
  const baseBody = interpolateTemplate(templateBody, renderContext);
  const finalBodyText = bodyTextOverride ? `${baseBody}\n\n${bodyTextOverride}` : baseBody;

  const recipient = resolveRecipient(renderContext);
  if (!recipient) throw new Error("No recipient email could be resolved for automation");

  const systemSettings = await getEffectiveSystemSettingsByUserId(userId);

  const html = buildAutomationEmailLayout({
    companyName: renderContext?.user?.organization_name || renderContext?.user?.name || "Automora",
    bodyHtml: toParagraphHtml(finalBodyText),
    invoice,
    supportHighlightText: systemSettings.supportHighlightText,
  });

  return { to: recipient, subject, body: finalBodyText, html, invoice };
};



const createGmailOAuthClient = ({ accessToken, refreshToken, tokenExpiry }) => {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
  );

  oauth2Client.setCredentials({
    access_token: accessToken || undefined,
    refresh_token: refreshToken || undefined,
    expiry_date: tokenExpiry ? new Date(tokenExpiry).getTime() : undefined,
  });

  return oauth2Client;
};

const toIso = (value) => {
  const d = new Date(Number(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const getHeaderValue = (headers, name) => {
  const target = String(name || "").toLowerCase();
  const row = (Array.isArray(headers) ? headers : []).find((item) => String(item?.name || "").toLowerCase() === target);
  return String(row?.value || "").trim();
};

const encodeBase64Url = (value) =>
  Buffer.from(String(value || ""), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const toBase64Chunks = (value, size = 76) => {
  const text = String(value || "").replace(/\s+/g, "");
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.join("\r\n");
};

const buildRawEmail = ({ to, from, subject, bodyText, htmlBody, inReplyTo, references, attachments = [] }) => {
  const normalizedHtmlBody = String(htmlBody || "").trim();
  const normalizedTextBody = String(bodyText || "").trim();
  const normalizedAttachments = Array.isArray(attachments)
    ? attachments.filter((item) => String(item?.contentBase64 || "").trim())
    : [];

  const headers = [
    `To: ${String(to || "").trim()}`,
    `From: ${String(from || "").trim()}`,
    "MIME-Version: 1.0",
    `Subject: ${String(subject || "").trim() || "(no subject)"}`,
  ];

  if (inReplyTo) headers.push(`In-Reply-To: ${String(inReplyTo).trim()}`);
  if (references) headers.push(`References: ${String(references).trim()}`);

  if (normalizedAttachments.length === 0) {
    headers.push(`Content-Type: ${normalizedHtmlBody ? "text/html" : "text/plain"}; charset="UTF-8"`);
    return [...headers, "", normalizedHtmlBody || normalizedTextBody].join("\r\n");
  }

  const boundary = `mixed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const bodyContentType = normalizedHtmlBody ? "text/html" : "text/plain";
  const bodyContent = normalizedHtmlBody || normalizedTextBody;
  const parts = [
    `--${boundary}`,
    `Content-Type: ${bodyContentType}; charset="UTF-8"`,
    "Content-Transfer-Encoding: 7bit",
    "",
    bodyContent,
  ];

  normalizedAttachments.forEach((attachment) => {
    const filename = String(attachment?.filename || "attachment.bin").replace(/["\r\n]/g, "");
    const contentType = String(attachment?.contentType || "application/octet-stream");
    parts.push(
      `--${boundary}`,
      `Content-Type: ${contentType}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      toBase64Chunks(attachment?.contentBase64 || ""),
    );
  });

  parts.push(`--${boundary}--`, "");
  return [...headers, "", ...parts].join("\r\n");
};

const sendViaConnectedGmail = async ({ userId, to, subject, bodyText, htmlBody = "", replyToExternalId = "", from, attachments = [] }) => {
  const integration = await getEmailIntegrationByProvider({ userId, provider: "gmail" });
  if (!integration?.access_token) {
    throw new Error("Gmail is not connected");
  }

  const oauth2Client = createGmailOAuthClient({
    accessToken: integration.access_token,
    refreshToken: integration.refresh_token,
    tokenExpiry: integration.token_expiry,
  });

  const token = await oauth2Client.getAccessToken();
  if (!token?.token && !oauth2Client.credentials?.access_token) {
    throw new Error("Unable to obtain Gmail access token");
  }

  const nextAccessToken = String(oauth2Client.credentials?.access_token || "").trim() || integration.access_token;
  const nextRefreshToken = String(oauth2Client.credentials?.refresh_token || "").trim() || integration.refresh_token;
  const nextTokenExpiry = oauth2Client.credentials?.expiry_date ? toIso(oauth2Client.credentials.expiry_date) : integration.token_expiry;

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

  oauth2Client.setCredentials({
    access_token: nextAccessToken,
    refresh_token: nextRefreshToken || undefined,
    expiry_date: nextTokenExpiry ? new Date(nextTokenExpiry).getTime() : undefined,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const connectedEmail = String(integration.connected_email || "").trim().toLowerCase();
  const senderEmail = String(profile?.data?.emailAddress || "").trim().toLowerCase();
  if (connectedEmail && senderEmail && connectedEmail !== senderEmail) {
    throw new Error("Connected Gmail account changed. Please reconnect Gmail.");
  }

  let threadId = "";
  let inReplyTo = "";
  let references = "";

  if (replyToExternalId) {
    const replyMessage = await gmail.users.messages.get({
      userId: "me",
      id: String(replyToExternalId).trim(),
      format: "metadata",
      metadataHeaders: ["Message-ID", "References"],
    });

    const headers = Array.isArray(replyMessage?.data?.payload?.headers) ? replyMessage.data.payload.headers : [];
    inReplyTo = getHeaderValue(headers, "Message-ID");
    references = [getHeaderValue(headers, "References"), inReplyTo].filter(Boolean).join(" ").trim();
    threadId = String(replyMessage?.data?.threadId || "").trim();
  }

  const raw = encodeBase64Url(buildRawEmail({ to, from, subject, bodyText, htmlBody, inReplyTo, references, attachments }));
  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      ...(threadId ? { threadId } : {}),
    },
  });
};
const executeTemplateMailSend = async ({ automation, userId, context, bodyTextOverride = null }) => {
  const rendered = await renderTemplateEmail({ automation, userId, context, bodyTextOverride });
  const replyToExternalId = String(context?.email?.externalId || "").trim();

  const systemSettings = await getEffectiveSystemSettingsByUserId(userId);
  const hasInvoice = Boolean(rendered.invoice);
  const attachments = [];

  if (hasInvoice) {
    const pdfBuffer = await buildAutomationInvoicePdfBuffer(rendered.invoice);
    const invoiceNumber = String(rendered.invoice?.invoice_number || rendered.invoice?.id || "invoice").replace(/[^a-zA-Z0-9-_]/g, "_");
    attachments.push({
      filename: `invoice-${invoiceNumber}.pdf`,
      contentType: "application/pdf",
      contentBase64: pdfBuffer.toString("base64"),
    });
  }

  await sendViaConnectedGmail({
    userId,
    to: rendered.to,
    from: systemSettings.smtpFrom,
    subject: rendered.subject,
    bodyText: rendered.body,
    htmlBody: hasInvoice ? "" : rendered.html,
    replyToExternalId,
    attachments,
  });

  return { to: rendered.to, subject: rendered.subject, body: rendered.body, mode: "sent" };
};

const executeAiForEmailReceived = async ({ automation, userId, context, asDraft }) => {
  const incoming = {
    from: String(context?.email?.from || "").trim(),
    subject: String(context?.email?.subject || "").trim(),
    body: String(context?.email?.body || "").trim(),
    attachments: Array.isArray(context?.email?.attachments) ? context.email.attachments : [],
  };

  const classification = await classifyIncomingEmail({ body: incoming.body });
  const relevantData = { classification };

  if (classification.category === "Invoice" || classification.invoiceFlag === 'invoicePresent' || classification.invoiceFlag === 'InvoicePresent') {
    // const invoiceNumber = extractInvoiceNumber(`${incoming.subject}\n${incoming.body}`);
    const invoiceNumber = classification.invoiceNumber;
    if (invoiceNumber) {
      const invoice = await getInvoiceByNumberForUser({ userId, invoiceNumber });
      if (invoice) {
        const invoiceDetails = await getInvoiceWithCustomerByIdForAutomation({ userId, invoiceId: invoice.id });
        if (invoiceDetails) {
          relevantData.invoice = invoiceDetails;
          relevantData.customer = {
            name: invoiceDetails.customer_name,
            email: invoiceDetails.customer_email,
            contact: invoiceDetails.customer_contact,
          };
        }
      } else {
        relevantData.classification = {
          category: 'Invoice',
          invoiceNumber: null,
          invoiceFlag: 'noInvoice'
        };
      }
    }
  }
  else {
    const customer = await getCustomerByEmail({ userId, email: incoming.from });
    if (customer) {
      relevantData.customer = customer;
      // const invoice = await getLatestInvoiceForCustomerEmail({ userId, customerEmail: incoming.from });
      // if (invoice) relevantData.invoice = invoice;
    }
  }

  const aiResponse = await generateAutomationContent({
    incomingEmailBody: incoming.body,
    relevantData,
  });

  const actionContext = {
    ...context,
    email: incoming,
    customer: relevantData.customer || context?.customer,
    invoice: relevantData.invoice || context?.invoice,
  };

  if (!asDraft) {
    const actionResult = await executeTemplateMailSend({
      automation,
      userId,
      context: actionContext,
      bodyTextOverride: aiResponse,
    });

    return {
      ...actionResult,
      classification,
      aiResponse,
      mode: "sent",
    };
  }

  const preview = await renderTemplateEmail({
    automation,
    userId,
    context: actionContext,
    bodyTextOverride: aiResponse,
  });

  const draft = await createDraftEmail({
    userId,
    automationId: automation.id,
    to: preview.to,
    subject: preview.subject,
    body: preview.body,
  });

  return {
    mode: "draft",
    classification,
    aiResponse,
    draft,
  };
};

const executeCrmUpsert = async ({ userId, context }) => {
  const email = normalizeEmail(context?.customer?.email || context?.invoice?.customer_email || "");
  if (!email) return;

  const existing = await getCustomerByEmail({ userId, email });
  const nextData = {
    name: String(context?.customer?.name || context?.invoice?.customer_name || "Unknown").trim(),
    client: String(context?.customer?.client || context?.invoice?.client_name || "Unknown Client").trim(),
    contact: String(context?.customer?.contact || "N/A").trim() || "N/A",
    email,
    status: String(context?.customer?.status || "Active").trim() || "Active",
    value: String(context?.customer?.value || "$0").trim() || "$0",
  };

  if (existing) {
    await updateCustomerById({
      customerId: existing.id,
      userId,
      ...nextData,
    });
    return;
  }

  await createCustomer({
    id: createUserId(),
    userId,
    ...nextData,
  });
};

const executeInvoiceUpsert = async ({ userId, context }) => {
  const invoiceNumber = String(context?.invoice?.invoice_number || "").trim();
  if (!invoiceNumber) return;

  const existing = await getInvoiceByNumberForUser({ userId, invoiceNumber });
  const payload = {
    customerId: context?.invoice?.customer_id || null,
    invoiceNumber,
    clientName: String(context?.invoice?.client_name || context?.customer?.client || "Unknown Client").trim(),
    issueDate: String(context?.invoice?.issue_date || new Date().toISOString().slice(0, 10)),
    dueDate: String(context?.invoice?.due_date || new Date().toISOString().slice(0, 10)),
    amount: Number(context?.invoice?.amount || 0),
    taxRate: Number(context?.invoice?.tax_rate || 0),
    status: String(context?.invoice?.status || "Unpaid").trim(),
    notes: String(context?.invoice?.notes || "Automation upsert"),
    lineItems: Array.isArray(context?.invoice?.line_items)
      ? context.invoice.line_items
      : [{ description: "Automation item", quantity: 1, rate: Number(context?.invoice?.amount || 0) }],
  };

  if (existing) {
    await updateInvoiceById({
      invoiceId: existing.id,
      userId,
      ...payload,
    });
    return;
  }

  await createInvoice({
    id: createUserId(),
    userId,
    ...payload,
  });
};

export const executeAutomationAction = async ({ automation, context }) => {
  const userId = automation.user_id;

  if (automation.action_type === "Send Mail") {
    return executeTemplateMailSend({ automation, userId, context });
  }

  if (automation.action_type === "AI Generate (Auto Send)" || automation.action_type === "AI Generate (Auto Reply)") {
    if (automation.trigger_type === "Email Received") {
      return executeAiForEmailReceived({ automation, userId, context, asDraft: false });
    }

    const aiResponse = await generateAutomationContent({
      incomingEmailBody: String(context?.email?.body || ""),
      relevantData: { context },
    });

    return executeTemplateMailSend({ automation, userId, context, bodyTextOverride: aiResponse });
  }

  if (automation.action_type === "AI Generate (Draft)") {
    if (automation.trigger_type === "Email Received") {
      return executeAiForEmailReceived({ automation, userId, context, asDraft: true });
    }

    const aiResponse = await generateAutomationContent({
      incomingEmailBody: String(context?.email?.body || ""),
      relevantData: { context },
    });

    const preview = await renderTemplateEmail({ automation, userId, context, bodyTextOverride: aiResponse });
    const draft = await createDraftEmail({
      userId,
      automationId: automation.id,
      to: preview.to,
      subject: preview.subject,
      body: preview.body,
    });

    return { mode: "draft", draft, aiResponse };
  }

  if (automation.action_type === "CRM" && automation.action_sub_type === "Upsert CRM") {
    await executeCrmUpsert({ userId, context });
    return { mode: "crm_upsert" };
  }

  if (automation.action_type === "Invoice" && automation.action_sub_type === "Upsert Invoice") {
    await executeInvoiceUpsert({ userId, context });
    return { mode: "invoice_upsert" };
  }

  return null;
};

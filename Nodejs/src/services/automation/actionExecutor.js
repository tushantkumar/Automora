import { getMailTemplateById } from "../../db/mailTemplateRepository.js";
import { sendBasicEmail } from "../emailService.js";
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
import { createDraftEmail } from "../../db/draftEmailRepository.js";

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

const resolveRecipient = (context) => {
  const candidates = [
    context?.customer?.email,
    context?.invoice?.customer_email,
    context?.invoice?.customerEmail,
    context?.email?.from,
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
  if (!invoiceRelated) return null;

  const invoiceId = String(context?.invoice?.id || "").trim();
  if (!invoiceId) {
    throw new Error("Invoice email requires invoice context");
  }

  const invoice = await getInvoiceWithCustomerByIdForAutomation({ userId, invoiceId });
  if (!invoice) {
    throw new Error("Invoice not found for email automation");
  }

  return invoice;
};

const executeTemplateMailSend = async ({ automation, userId, context, bodyTextOverride = null }) => {
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

  const html = buildAutomationEmailLayout({
    companyName: renderContext?.user?.organization_name || renderContext?.user?.name || "Auto-X",
    bodyHtml: toParagraphHtml(finalBodyText),
    invoice,
  });

  await sendBasicEmail({
    to: recipient,
    subject,
    text: finalBodyText,
    html,
  });

  return { to: recipient, subject, body: finalBodyText, mode: "sent" };
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

  if (classification === "Invoice") {
    const invoiceNumber = extractInvoiceNumber(`${incoming.subject}\n${incoming.body}`);
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
      }
    }
  } else {
    const customer = await getCustomerByEmail({ userId, email: incoming.from });
    if (customer) {
      relevantData.customer = customer;
      const invoice = await getLatestInvoiceForCustomerEmail({ userId, customerEmail: incoming.from });
      if (invoice) relevantData.invoice = invoice;
    }
  }

  const aiResponse = await generateAutomationContent({
    incomingEmailBody: incoming.body,
    relevantData,
  });

  const actionResult = await executeTemplateMailSend({
    automation,
    userId,
    context: {
      ...context,
      email: incoming,
      customer: relevantData.customer || context?.customer,
      invoice: relevantData.invoice || context?.invoice,
    },
    bodyTextOverride: aiResponse,
  });

  if (!asDraft) {
    return {
      ...actionResult,
      classification,
      aiResponse,
      mode: "sent",
    };
  }

  const draft = await createDraftEmail({
    userId,
    automationId: automation.id,
    to: actionResult.to,
    subject: actionResult.subject,
    body: actionResult.body,
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

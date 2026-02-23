import { getMailTemplateById } from "../../db/mailTemplateRepository.js";
import { sendBasicEmail } from "../emailService.js";
import { createCustomer, getCustomerByEmail, updateCustomerById } from "../../db/customerRepository.js";
import {
  createInvoice,
  getInvoiceByNumberForUser,
  getInvoiceWithCustomerByIdForAutomation,
  updateInvoiceById,
} from "../../db/invoiceRepository.js";
import { createUserId, normalizeEmail } from "../../utils/auth.js";
import { generateAutomationContent } from "./aiService.js";
import { buildAutomationEmailLayout } from "./emailLayout.js";

const getByPath = (obj, path) => String(path || "")
  .split(".")
  .reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), obj);


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

const executeMailLikeAction = async ({ automation, userId, context, mode }) => {
  if (!automation.mail_template_id) {
    throw new Error("Mail template is required for mail automation action");
  }

  const template = await getMailTemplateById({ templateId: automation.mail_template_id, userId });
  if (!template) {
    throw new Error("Mail template not found");
  }

  const templateSubject = String(template.subject || "").trim();
  const templateBody = String(template.body || "").trim();

  if (!templateSubject) throw new Error("Mail template subject is empty");
  if (!templateBody) throw new Error("Mail template body is empty");

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

  const generatedBody = mode.startsWith("AI Generate")
    ? await generateAutomationContent({ mode, templateBody: baseBody, context: renderContext })
    : baseBody;

  const recipient = resolveRecipient(renderContext);
  if (!recipient) {
    throw new Error("No recipient email could be resolved for automation");
  }

  const html = buildAutomationEmailLayout({
    companyName: renderContext?.user?.organization_name || renderContext?.user?.name || "Auto-X",
    bodyHtml: toParagraphHtml(generatedBody),
    invoice,
  });

  await sendBasicEmail({
    to: recipient,
    subject,
    text: generatedBody,
    html,
  });
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
    await executeMailLikeAction({ automation, userId, context, mode: "Send Mail" });
    return;
  }

  if (automation.action_type === "AI Generate (Auto Reply)" || automation.action_type === "AI Generate (Draft)") {
    await executeMailLikeAction({ automation, userId, context, mode: automation.action_type });
    return;
  }

  if (automation.action_type === "CRM" && automation.action_sub_type === "Upsert CRM") {
    await executeCrmUpsert({ userId, context });
    return;
  }

  if (automation.action_type === "Invoice" && automation.action_sub_type === "Upsert Invoice") {
    await executeInvoiceUpsert({ userId, context });
  }
};

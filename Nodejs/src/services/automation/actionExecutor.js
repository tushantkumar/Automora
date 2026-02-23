import { getMailTemplateById } from "../../db/mailTemplateRepository.js";
import { sendBasicEmail } from "../emailService.js";
import { createCustomer, getCustomerByEmail, updateCustomerById } from "../../db/customerRepository.js";
import { createInvoice, getInvoiceByNumberForUser, updateInvoiceById } from "../../db/invoiceRepository.js";
import { createUserId, normalizeEmail } from "../../utils/auth.js";
import { generateAutomationContent } from "./aiService.js";

const interpolateTemplate = (template, context) =>
  String(template || "").replace(/{{\s*([\w.]+)\s*}}/g, (_, token) => {
    const [entity, field] = String(token).split(".");
    return String(context?.[entity]?.[field] ?? "");
  });

const resolveRecipient = (context) => {
  const candidates = [
    context?.customer?.email,
    context?.invoice?.customer_email,
    context?.email?.from,
  ];

  return candidates.find((value) => String(value || "").includes("@")) || "";
};

const executeMailLikeAction = async ({ automation, userId, context, mode }) => {
  const template = await getMailTemplateById({ templateId: automation.mail_template_id, userId });
  if (!template) return;

  const subject = interpolateTemplate(template.subject, context);
  const rawBody = interpolateTemplate(template.body, context);

  const finalBody = mode.startsWith("AI Generate")
    ? await generateAutomationContent({ mode, templateBody: rawBody, context })
    : rawBody;

  const recipient = resolveRecipient(context);
  if (!recipient) return;

  await sendBasicEmail({
    to: recipient,
    subject,
    text: finalBody,
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
    lineItems: Array.isArray(context?.invoice?.line_items) ? context.invoice.line_items : [{ description: "Automation item", quantity: 1, rate: Number(context?.invoice?.amount || 0) }],
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

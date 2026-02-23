import { getUserBySessionToken } from "../db/authRepository.js";
import {
  createInvoice,
  deleteInvoiceById,
  getInvoiceById,
  getInvoiceInsightsByUserId,
  getPaidRevenueByCustomerId,
  listInvoicesByUserId,
  markOverdueInvoicesByUserId,
  updateInvoiceById,
} from "../db/invoiceRepository.js";
import { createUserId } from "../utils/auth.js";
import { getCustomerById, setCustomerRevenueById } from "../db/customerRepository.js";
import { processInvoiceStatusChangeAutomations } from "./invoiceWorkflowAutomationService.js";

const readBearerToken = (authHeader) =>
  String(authHeader || "").startsWith("Bearer ") ? String(authHeader).slice(7) : "";

const getAuthorizedUser = async (authHeader) => {
  const token = readBearerToken(authHeader);
  if (!token) return null;
  return getUserBySessionToken(token);
};

const normalizeLineItems = (lineItems) => {
  if (!Array.isArray(lineItems)) return [];

  return lineItems
    .map((item) => ({
      description: String(item?.description || "").trim(),
      quantity: Number(item?.quantity),
      rate: Number(item?.rate),
    }))
    .filter((item) => item.description && Number.isFinite(item.quantity) && item.quantity >= 0 && Number.isFinite(item.rate) && item.rate >= 0);
};

const normalizePayload = (payload) => ({
  customerId: String(payload?.customerId || "").trim(),
  invoiceNumber: String(payload?.invoiceNumber || "").trim(),
  clientName: String(payload?.clientName || "").trim(),
  issueDate: String(payload?.issueDate || "").trim(),
  dueDate: String(payload?.dueDate || "").trim(),
  amount: Number(payload?.amount),
  taxRate: Number(payload?.taxRate ?? 0),
  status: String(payload?.status || "Unpaid").trim() || "Unpaid",
  notes: String(payload?.notes || "").trim(),
  lineItems: normalizeLineItems(payload?.lineItems),
});


const syncCustomerRevenueById = async ({ userId, customerId }) => {
  const normalizedCustomerId = String(customerId || "").trim();
  if (!normalizedCustomerId) return;

  const paidRevenue = await getPaidRevenueByCustomerId({ userId, customerId: normalizedCustomerId });
  const revenueValue = `$${Number(paidRevenue || 0).toFixed(2)}`;
  await setCustomerRevenueById({ userId, customerId: normalizedCustomerId, revenueValue });
};

export const getInvoicesForUser = async (authHeader, query = {}) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  await markOverdueInvoicesByUserId(user.id);

  const invoices = await listInvoicesByUserId({
    userId: user.id,
    invoiceNumber: String(query.invoiceNumber || "").trim(),
    fromDate: String(query.fromDate || "").trim(),
    toDate: String(query.toDate || "").trim(),
  });

  return { status: 200, body: { invoices } };
};

export const getInvoiceInsightsForUser = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  await markOverdueInvoicesByUserId(user.id);

  const insights = await getInvoiceInsightsByUserId(user.id);
  return { status: 200, body: { insights } };
};

export const createInvoiceForUser = async (authHeader, payload) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const data = normalizePayload(payload);

  if (!data.customerId || !data.invoiceNumber || !data.issueDate || !data.dueDate || data.lineItems.length === 0 || !Number.isFinite(data.amount) || data.amount < 0 || !Number.isFinite(data.taxRate) || data.taxRate < 0) {
    return { status: 400, body: { message: "customerId, invoiceNumber, issueDate, dueDate, lineItems and valid amount are required" } };
  }

  const customer = await getCustomerById({ customerId: data.customerId, userId: user.id });
  if (!customer) return { status: 404, body: { message: "customer not found" } };

  try {
    const invoice = await createInvoice({
      id: createUserId(),
      userId: user.id,
      ...data,
      clientName: customer.client,
    });

    await syncCustomerRevenueById({ userId: user.id, customerId: data.customerId });
    await processInvoiceStatusChangeAutomations({ user, previousInvoice: null, invoice, customer });

    return { status: 201, body: { message: "invoice created", invoice } };
  } catch {
    return { status: 409, body: { message: "invoice number already exists" } };
  }
};

export const updateInvoiceForUser = async (authHeader, invoiceId, payload) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const data = normalizePayload(payload);

  if (!data.customerId || !data.invoiceNumber || !data.issueDate || !data.dueDate || data.lineItems.length === 0 || !Number.isFinite(data.amount) || data.amount < 0 || !Number.isFinite(data.taxRate) || data.taxRate < 0) {
    return { status: 400, body: { message: "customerId, invoiceNumber, issueDate, dueDate, lineItems and valid amount are required" } };
  }

  const existingInvoice = await getInvoiceById({ invoiceId, userId: user.id });
  if (!existingInvoice) return { status: 404, body: { message: "invoice not found" } };

  const customer = await getCustomerById({ customerId: data.customerId, userId: user.id });
  if (!customer) return { status: 404, body: { message: "customer not found" } };

  const invoice = await updateInvoiceById({
    invoiceId,
    userId: user.id,
    ...data,
    clientName: customer.client,
  });

  await syncCustomerRevenueById({ userId: user.id, customerId: existingInvoice.customer_id });
  await syncCustomerRevenueById({ userId: user.id, customerId: data.customerId });
  await processInvoiceStatusChangeAutomations({ user, previousInvoice: existingInvoice, invoice, customer });

  return { status: 200, body: { message: "invoice updated", invoice } };
};

export const deleteInvoiceForUser = async (authHeader, invoiceId) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const existingInvoice = await getInvoiceById({ invoiceId, userId: user.id });
  if (!existingInvoice) return { status: 404, body: { message: "invoice not found" } };

  const deleted = await deleteInvoiceById({ invoiceId, userId: user.id });
  if (!deleted) return { status: 404, body: { message: "invoice not found" } };

  await syncCustomerRevenueById({ userId: user.id, customerId: existingInvoice.customer_id });

  return { status: 200, body: { message: "invoice deleted" } };
};

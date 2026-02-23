import { getUserBySessionToken } from "../db/authRepository.js";
import {
  createCustomer,
  deleteCustomerById,
  listCustomersByUserId,
  updateCustomerById,
} from "../db/customerRepository.js";
import { createUserId, normalizeEmail } from "../utils/auth.js";
import { countInvoicesByCustomerId } from "../db/invoiceRepository.js";

const readBearerToken = (authHeader) =>
  String(authHeader || "").startsWith("Bearer ") ? String(authHeader).slice(7) : "";

const getAuthorizedUser = async (authHeader) => {
  const token = readBearerToken(authHeader);
  if (!token) return null;
  return getUserBySessionToken(token);
};

const normalizePayload = (payload) => ({
  name: String(payload?.name || "").trim(),
  client: String(payload?.client || "").trim(),
  contact: String(payload?.contact || "").trim(),
  email: normalizeEmail(payload?.email),
  status: String(payload?.status || "Active").trim() || "Active",
  value: String(payload?.value || "").trim(),
});

export const getCustomersForUser = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const customers = await listCustomersByUserId(user.id);
  return { status: 200, body: { customers } };
};

export const createCustomerForUser = async (authHeader, payload) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const data = normalizePayload(payload);
  if (!data.name || !data.client || !data.contact || !data.email) {
    return { status: 400, body: { message: "name, client, contact and email are required" } };
  }

  const customer = await createCustomer({
    id: createUserId(),
    userId: user.id,
    ...data,
  });

  const workflowResult = null;

  return {
    status: 201,
    body: {
      message: "customer created",
      customer,
    },
  };
};

export const updateCustomerForUser = async (authHeader, customerId, payload) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const data = normalizePayload(payload);
  if (!data.name || !data.client || !data.contact || !data.email) {
    return { status: 400, body: { message: "name, client, contact and email are required" } };
  }

  const customer = await updateCustomerById({
    customerId,
    userId: user.id,
    ...data,
  });

  if (!customer) return { status: 404, body: { message: "customer not found" } };

  return { status: 200, body: { message: "customer updated", customer } };
};

export const deleteCustomerForUser = async (authHeader, customerId) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const invoiceCount = await countInvoicesByCustomerId({ userId: user.id, customerId });
  if (invoiceCount > 0) {
    return {
      status: 409,
      body: {
        message: "Customer has invoices. Please delete invoices first.",
        invoiceCount,
      },
    };
  }

  const deleted = await deleteCustomerById({ customerId, userId: user.id });
  if (!deleted) return { status: 404, body: { message: "customer not found" } };

  return { status: 200, body: { message: "customer deleted" } };
};

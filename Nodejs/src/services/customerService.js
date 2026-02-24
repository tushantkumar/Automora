import PDFDocument from "pdfkit";
import { getUserBySessionToken } from "../db/authRepository.js";
import {
  createCustomer,
  deleteCustomerById,
  getCustomerById,
  listCustomersByUserId,
  updateCustomerById,
} from "../db/customerRepository.js";
import { createUserId, normalizeEmail } from "../utils/auth.js";
import { countInvoicesByCustomerId, listInvoicesByCustomerId } from "../db/invoiceRepository.js";
import { runAutomations } from "./automation/executionEngine.js";

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


const toCurrency = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "$0.00";
};

const toFriendlyDate = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
};

const parseLineItems = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const collectPdfBuffer = (doc) => new Promise((resolve, reject) => {
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.on("error", reject);
});

const generateCustomerInvoicePdfBuffer = async ({ customer, invoices }) => {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const bufferPromise = collectPdfBuffer(doc);

  doc.rect(0, 0, doc.page.width, 80).fill("#4f46e5");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(24).text("Customer Invoice Report", 50, 28);

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(16).text("Customer Details", 50, 110);
  doc.font("Helvetica").fontSize(11)
    .text(`Name: ${String(customer?.name || "-")}`, 50, 136)
    .text(`Client: ${String(customer?.client || "-")}`, 50, 154)
    .text(`Email: ${String(customer?.email || "-")}`, 50, 172)
    .text(`Contact: ${String(customer?.contact || "-")}`, 50, 190)
    .text(`Status: ${String(customer?.status || "-")}`, 50, 208)
    .text(`Revenue: ${String(customer?.value || "-")}`, 50, 226);

  let y = 260;
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(16).text("Invoices", 50, y);
  y += 24;

  doc.roundedRect(50, y, 495, 28, 6).fillAndStroke("#eef2ff", "#c7d2fe");
  doc.fillColor("#3730a3").font("Helvetica-Bold").fontSize(10);
  doc.text("Invoice", 62, y + 9, { width: 95 });
  doc.text("Issue", 160, y + 9, { width: 90 });
  doc.text("Due", 252, y + 9, { width: 90 });
  doc.text("Status", 345, y + 9, { width: 85 });
  doc.text("Amount", 438, y + 9, { width: 95, align: "right" });
  y += 32;

  let grandTotal = 0;

  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    if (y > 760) {
      doc.addPage();
      y = 50;
    }

    const amount = Number(invoice?.amount || 0);
    grandTotal += Number.isFinite(amount) ? amount : 0;

    doc.roundedRect(50, y, 495, 24, 5).fillAndStroke("#ffffff", "#e2e8f0");
    doc.fillColor("#0f172a").font("Helvetica").fontSize(10);
    doc.text(String(invoice?.invoice_number || "-"), 62, y + 7, { width: 95 });
    doc.text(toFriendlyDate(invoice?.issue_date), 160, y + 7, { width: 90 });
    doc.text(toFriendlyDate(invoice?.due_date), 252, y + 7, { width: 90 });
    doc.text(String(invoice?.status || "-"), 345, y + 7, { width: 85 });
    doc.text(toCurrency(amount), 438, y + 7, { width: 95, align: "right" });
    y += 28;

    const items = parseLineItems(invoice?.line_items);
    for (const item of items) {
      if (y > 770) {
        doc.addPage();
        y = 50;
      }
      const quantity = Number(item?.quantity || 0);
      const rate = Number(item?.rate || 0);
      const total = quantity * rate;
      doc.fillColor("#64748b").fontSize(9).text(
        `• ${String(item?.description || "-")}  |  Qty: ${quantity}  Rate: ${toCurrency(rate)}  Total: ${toCurrency(total)}`,
        72,
        y,
        { width: 455 },
      );
      y += 16;
    }
    y += 8;
  }

  y += 6;
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12)
    .text(`Total Invoices: ${Array.isArray(invoices) ? invoices.length : 0}`, 50, y)
    .text(`Grand Total: ${toCurrency(grandTotal)}`, 50, y, { align: "right" });

  doc.end();
  return bufferPromise;
};

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

  await runAutomations({
    triggerType: "Customer",
    subTriggerType: "Created",
    context: { customer, user },
  });

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

  await runAutomations({
    triggerType: "Customer",
    subTriggerType: "Updated",
    context: { customer, user },
  });

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

  const customer = await getCustomerById({ customerId, userId: user.id });
  if (!customer) return { status: 404, body: { message: "customer not found" } };

  const deleted = await deleteCustomerById({ customerId, userId: user.id });
  if (!deleted) return { status: 404, body: { message: "customer not found" } };

  await runAutomations({
    triggerType: "Customer",
    subTriggerType: "Deleted",
    context: { customer, user },
  });

  return { status: 200, body: { message: "customer deleted" } };
};


export const getCustomerInvoicePdfForUser = async (authHeader, customerId) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const targetCustomerId = String(customerId || "").trim();
  if (!targetCustomerId) return { status: 400, body: { message: "customer id is required" } };

  const customer = await getCustomerById({ customerId: targetCustomerId, userId: user.id });
  if (!customer) return { status: 404, body: { message: "customer not found" } };

  const invoices = await listInvoicesByCustomerId({ userId: user.id, customerId: targetCustomerId });

  try {
    const buffer = await generateCustomerInvoicePdfBuffer({ customer, invoices });
    const safeName = String(customer?.name || customer?.id || "customer").replace(/[^a-zA-Z0-9-_]/g, "_");

    return {
      status: 200,
      body: {
        buffer,
        fileName: `customer-invoices-${safeName}.pdf`,
      },
    };
  } catch {
    return { status: 502, body: { message: "Unable to generate customer invoice PDF" } };
  }
};

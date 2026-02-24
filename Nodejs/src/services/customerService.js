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


const escapeSpreadsheetXml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const buildCustomerInvoiceExcelBuffer = async ({ customersWithInvoices }) => {
  const rows = [];
  rows.push('<?xml version="1.0"?>');
  rows.push('<?mso-application progid="Excel.Sheet"?>');
  rows.push('<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">');
  rows.push('<Worksheet ss:Name="Customer Reports">');
  rows.push('<Table>');

  const headerCells = [
    "Customer Name",
    "Client",
    "Email",
    "Contact",
    "Customer Status",
    "Revenue",
    "Invoice Number",
    "Issue Date",
    "Due Date",
    "Invoice Status",
    "Tax",
    "Amount",
    "Line Item Description",
    "Quantity",
    "Rate",
    "Line Total",
  ].map((header) => `<Cell><Data ss:Type="String">${escapeSpreadsheetXml(header)}</Data></Cell>`).join("");
  rows.push(`<Row>${headerCells}</Row>`);

  for (const item of Array.isArray(customersWithInvoices) ? customersWithInvoices : []) {
    const customer = item?.customer || {};
    const invoices = Array.isArray(item?.invoices) ? item.invoices : [];

    let grandTotal = 0;
    let grandTax = 0;

    for (const invoice of invoices) {
      const amount = Number(invoice?.amount || 0);
      const taxRate = Number(invoice?.tax_rate || 0);
      const taxAmount = Number.isFinite(amount) && Number.isFinite(taxRate) ? (amount * taxRate) / 100 : 0;
      grandTotal += Number.isFinite(amount) ? amount : 0;
      grandTax += Number.isFinite(taxAmount) ? taxAmount : 0;

      const lineItems = parseLineItems(invoice?.line_items);
      const normalizedItems = lineItems.length > 0 ? lineItems : [null];

      for (const lineItem of normalizedItems) {
        const quantity = Number(lineItem?.quantity || 0);
        const rate = Number(lineItem?.rate || 0);
        const lineTotal = quantity * rate;

        const cells = [
          { type: "String", value: String(customer?.name || "") },
          { type: "String", value: String(customer?.client || "") },
          { type: "String", value: String(customer?.email || "") },
          { type: "String", value: String(customer?.contact || "") },
          { type: "String", value: String(customer?.status || "") },
          { type: "String", value: String(customer?.value || "") },
          { type: "String", value: String(invoice?.invoice_number || "") },
          { type: "String", value: String(invoice?.issue_date || "").slice(0, 10) },
          { type: "String", value: String(invoice?.due_date || "").slice(0, 10) },
          { type: "String", value: String(invoice?.status || "") },
          { type: "Number", value: Number.isFinite(taxAmount) ? taxAmount : 0 },
          { type: "Number", value: Number.isFinite(amount) ? amount : 0 },
          { type: "String", value: String(lineItem?.description || "") },
          { type: "Number", value: Number.isFinite(quantity) ? quantity : 0 },
          { type: "Number", value: Number.isFinite(rate) ? rate : 0 },
          { type: "Number", value: Number.isFinite(lineTotal) ? lineTotal : 0 },
        ];
        rows.push(`<Row>${cells.map((cell) => `<Cell><Data ss:Type="${cell.type}">${escapeSpreadsheetXml(cell.value)}</Data></Cell>`).join("")}</Row>`);
      }
    }

    rows.push('<Row></Row>');
    rows.push(`<Row><Cell><Data ss:Type="String">${escapeSpreadsheetXml(String(customer?.name || "Customer"))} Summary</Data></Cell><Cell/><Cell/><Cell/><Cell/><Cell/><Cell><Data ss:Type="String">Total Invoices</Data></Cell><Cell><Data ss:Type="Number">${invoices.length}</Data></Cell><Cell/><Cell><Data ss:Type="String">Total Tax</Data></Cell><Cell><Data ss:Type="Number">${grandTax}</Data></Cell><Cell><Data ss:Type="String">Grand Total</Data></Cell><Cell><Data ss:Type="Number">${grandTotal}</Data></Cell><Cell/><Cell/></Row>`);
    rows.push('<Row></Row>');
  }

  rows.push('</Table>');
  rows.push('</Worksheet>');
  rows.push('</Workbook>');

  return Buffer.from(rows.join(""), "utf8");
};

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
  doc.text("Status", 345, y + 9, { width: 70 });
  doc.text("Tax", 417, y + 9, { width: 55, align: "right" });
  doc.text("Amount", 474, y + 9, { width: 60, align: "right" });
  y += 32;

  let grandTotal = 0;
  let grandTax = 0;

  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    if (y > 760) {
      doc.addPage();
      y = 50;
    }

    const amount = Number(invoice?.amount || 0);
    const taxRate = Number(invoice?.tax_rate || 0);
    const taxAmount = Number.isFinite(amount) && Number.isFinite(taxRate) ? (amount * taxRate) / 100 : 0;
    grandTotal += Number.isFinite(amount) ? amount : 0;
    grandTax += Number.isFinite(taxAmount) ? taxAmount : 0;

    doc.roundedRect(50, y, 495, 24, 5).fillAndStroke("#ffffff", "#e2e8f0");
    doc.fillColor("#0f172a").font("Helvetica").fontSize(10);
    doc.text(String(invoice?.invoice_number || "-"), 62, y + 7, { width: 95 });
    doc.text(toFriendlyDate(invoice?.issue_date), 160, y + 7, { width: 90 });
    doc.text(toFriendlyDate(invoice?.due_date), 252, y + 7, { width: 90 });
    doc.text(String(invoice?.status || "-"), 345, y + 7, { width: 70 });
    doc.text(toCurrency(taxAmount), 417, y + 7, { width: 55, align: "right" });
    doc.text(toCurrency(amount), 474, y + 7, { width: 60, align: "right" });
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
    .text(`Total Tax: ${toCurrency(grandTax)}`, 50, y + 18)
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



export const exportCustomerInvoicesExcelForUser = async (authHeader, query = {}) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const normalizedQuery = String(query.search || "").trim().toLowerCase();
  const customers = await listCustomersByUserId(user.id);
  const filteredCustomers = normalizedQuery
    ? customers.filter((customer) => [customer?.name, customer?.client, customer?.contact, customer?.email, customer?.status]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery))
    : customers;

  const customersWithInvoices = await Promise.all(
    filteredCustomers.map(async (customer) => ({
      customer,
      invoices: await listInvoicesByCustomerId({ userId: user.id, customerId: customer.id }),
    })),
  );

  try {
    const buffer = await buildCustomerInvoiceExcelBuffer({ customersWithInvoices });
    return {
      status: 200,
      body: {
        buffer,
        fileName: `customers-report-${new Date().toISOString().slice(0, 10)}.xls`,
      },
    };
  } catch {
    return { status: 502, body: { message: "Unable to generate customer invoices Excel" } };
  }
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

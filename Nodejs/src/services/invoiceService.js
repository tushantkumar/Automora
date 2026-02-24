import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
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
  getInvoiceWithCustomerByIdForAutomation,
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

const drawRow = ({ doc, y, label, value }) => {
  doc.roundedRect(50, y, 495, 26, 6).fillAndStroke("#ffffff", "#e2e8f0");
  doc.fillColor("#334155").font("Helvetica-Bold").fontSize(10).text(label, 62, y + 8, { width: 170 });
  doc.fillColor("#0f172a").font("Helvetica").fontSize(10).text(value, 220, y + 8, { width: 315, align: "right" });
};

const generateInvoicePdfBuffer = async ({ invoice }) => {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const bufferPromise = collectPdfBuffer(doc);

  const lineItems = parseLineItems(invoice?.line_items);
  const safeInvoiceNumber = String(invoice?.invoice_number || invoice?.id || "-");

  doc.rect(0, 0, doc.page.width, 120).fill("#f1f5f9");
  doc.rect(0, 0, doc.page.width, 80).fill("#4f46e5");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(24).text("Auto-X Invoice", 50, 28);
  doc.fontSize(11).font("Helvetica").text(`Invoice #${safeInvoiceNumber}`, 50, 56);

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(14).text("Invoice Details", 50, 140);

  let y = 165;
  drawRow({ doc, y, label: "Invoice Number", value: safeInvoiceNumber }); y += 34;
  drawRow({ doc, y, label: "Issue Date", value: toFriendlyDate(invoice?.issue_date) }); y += 34;
  drawRow({ doc, y, label: "Due Date", value: toFriendlyDate(invoice?.due_date) }); y += 34;
  drawRow({ doc, y, label: "Status", value: String(invoice?.status || "-") }); y += 34;
  drawRow({ doc, y, label: "Amount", value: toCurrency(invoice?.amount) }); y += 34;
  drawRow({ doc, y, label: "Tax", value: `${Number(invoice?.tax_rate || 0).toFixed(2)}%` }); y += 34;
  drawRow({ doc, y, label: "Customer", value: String(invoice?.customer_name || invoice?.client_name || "-") }); y += 34;
  drawRow({ doc, y, label: "Customer Email", value: String(invoice?.customer_email || "-") }); y += 34;
  drawRow({ doc, y, label: "Notes", value: String(invoice?.notes || "-") }); y += 44;

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(14).text("Line Items", 50, y);
  y += 24;

  doc.roundedRect(50, y, 495, 28, 6).fillAndStroke("#eef2ff", "#c7d2fe");
  doc.fillColor("#3730a3").font("Helvetica-Bold").fontSize(10);
  doc.text("Description", 62, y + 9, { width: 250 });
  doc.text("Qty", 330, y + 9, { width: 60, align: "right" });
  doc.text("Rate", 395, y + 9, { width: 65, align: "right" });
  doc.text("Total", 470, y + 9, { width: 65, align: "right" });
  y += 32;

  for (const item of lineItems) {
    if (y > 760) {
      doc.addPage();
      y = 50;
    }

    const quantity = Number(item?.quantity || 0);
    const rate = Number(item?.rate || 0);
    const total = quantity * rate;

    doc.roundedRect(50, y, 495, 24, 5).fillAndStroke("#ffffff", "#e2e8f0");
    doc.fillColor("#0f172a").font("Helvetica").fontSize(10);
    doc.text(String(item?.description || "-"), 62, y + 7, { width: 250 });
    doc.text(String(quantity), 330, y + 7, { width: 60, align: "right" });
    doc.text(toCurrency(rate), 395, y + 7, { width: 65, align: "right" });
    doc.text(toCurrency(total), 470, y + 7, { width: 65, align: "right" });
    y += 28;
  }

  y += 10;
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12).text(`Grand Total: ${toCurrency(invoice?.amount)}`, 50, y, { align: "right" });

  doc.end();
  return bufferPromise;
};


const parseInvoiceLineItems = (value) => {
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

const styleExcelHeader = (row) => {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
  row.height = 20;
};

const buildInvoiceExcelBuffer = async ({ invoices }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Auto-X";
  workbook.created = new Date();

  const invoiceSheet = workbook.addWorksheet("Invoices");
  invoiceSheet.columns = [
    { header: "Invoice Number", key: "invoice_number", width: 20 },
    { header: "Client", key: "client_name", width: 26 },
    { header: "Issue Date", key: "issue_date", width: 16 },
    { header: "Due Date", key: "due_date", width: 16 },
    { header: "Status", key: "status", width: 14 },
    { header: "Tax Rate %", key: "tax_rate", width: 12 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Notes", key: "notes", width: 36 },
  ];
  styleExcelHeader(invoiceSheet.getRow(1));

  const lineItemSheet = workbook.addWorksheet("Line Items");
  lineItemSheet.columns = [
    { header: "Invoice Number", key: "invoice_number", width: 20 },
    { header: "Description", key: "description", width: 40 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Rate", key: "rate", width: 14 },
    { header: "Total", key: "total", width: 14 },
  ];
  styleExcelHeader(lineItemSheet.getRow(1));

  let grandTotal = 0;

  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    const amount = Number(invoice?.amount || 0);
    grandTotal += Number.isFinite(amount) ? amount : 0;

    invoiceSheet.addRow({
      invoice_number: String(invoice?.invoice_number || ""),
      client_name: String(invoice?.client_name || ""),
      issue_date: String(invoice?.issue_date || "").slice(0, 10),
      due_date: String(invoice?.due_date || "").slice(0, 10),
      status: String(invoice?.status || ""),
      tax_rate: Number(invoice?.tax_rate || 0),
      amount,
      notes: String(invoice?.notes || ""),
    });

    const items = parseInvoiceLineItems(invoice?.line_items);
    for (const item of items) {
      const quantity = Number(item?.quantity || 0);
      const rate = Number(item?.rate || 0);
      lineItemSheet.addRow({
        invoice_number: String(invoice?.invoice_number || ""),
        description: String(item?.description || ""),
        quantity,
        rate,
        total: quantity * rate,
      });
    }
  }

  invoiceSheet.addRow({});
  const totalRow = invoiceSheet.addRow({ amount: grandTotal, notes: "Grand Total" });
  totalRow.font = { bold: true };

  [invoiceSheet, lineItemSheet].forEach((sheet) => {
    sheet.eachRow((row, idx) => {
      if (idx === 1) return;
      row.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

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


export const getInvoicePdfForUser = async (authHeader, invoiceId) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const targetInvoiceId = String(invoiceId || "").trim();
  if (!targetInvoiceId) return { status: 400, body: { message: "invoice id is required" } };

  const invoice = await getInvoiceWithCustomerByIdForAutomation({ userId: user.id, invoiceId: targetInvoiceId });
  if (!invoice) return { status: 404, body: { message: "invoice not found" } };

  try {
    const buffer = await generateInvoicePdfBuffer({ invoice });
    const invoiceNumber = String(invoice?.invoice_number || invoice?.id || "invoice").replace(/[^a-zA-Z0-9-_]/g, "_");

    return {
      status: 200,
      body: {
        buffer,
        fileName: `invoice-${invoiceNumber}.pdf`,
      },
    };
  } catch {
    return { status: 502, body: { message: "Unable to generate invoice PDF" } };
  }
};


export const exportInvoicesExcelForUser = async (authHeader, query = {}) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  await markOverdueInvoicesByUserId(user.id);

  const invoices = await listInvoicesByUserId({
    userId: user.id,
    invoiceNumber: String(query.invoiceNumber || "").trim(),
    fromDate: String(query.fromDate || "").trim(),
    toDate: String(query.toDate || "").trim(),
  });

  try {
    const buffer = await buildInvoiceExcelBuffer({ invoices });
    return {
      status: 200,
      body: {
        buffer,
        fileName: `invoices-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
      },
    };
  } catch {
    return { status: 502, body: { message: "Unable to generate invoices Excel" } };
  }
};

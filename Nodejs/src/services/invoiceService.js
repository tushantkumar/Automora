import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
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
import { getCustomerByEmail, getCustomerById, setCustomerRevenueById } from "../db/customerRepository.js";
import { processInvoiceStatusChangeAutomations } from "./invoiceWorkflowAutomationService.js";
import { sendGmailEmail } from "./emailIntegrationService.js";

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

const normalizeExcelDate = (value) => {
  if (!value && value !== 0) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const utcDays = Math.floor(value - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    if (!Number.isNaN(dateInfo.getTime())) return dateInfo.toISOString().slice(0, 10);
  }

  const parsed = new Date(String(value).trim());
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const parseImportedLineItems = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return [];

  return raw
    .split(";")
    .map((entry) => {
      const [description, quantityValue, rateValue] = entry.split("|").map((part) => String(part || "").trim());
      return {
        description,
        quantity: Number(quantityValue),
        rate: Number(rateValue),
      };
    })
    .filter((item) => item.description && Number.isFinite(item.quantity) && item.quantity >= 0 && Number.isFinite(item.rate) && item.rate >= 0);
};

const parseInvoiceRowsFromExcelBuffer = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const invoiceNumber = String(row.getCell(1).value || "").trim();
    const customerEmail = String(row.getCell(2).value || "").trim();
    const issueDate = normalizeExcelDate(row.getCell(3).value);
    const dueDate = normalizeExcelDate(row.getCell(4).value);
    const statusRaw = String(row.getCell(5).value ?? "").trim();
    const status = statusRaw || "Unpaid";
    const taxRateRaw = String(row.getCell(6).value ?? "").trim();
    const taxRate = taxRateRaw ? Number(taxRateRaw) : 0;
    const notes = String(row.getCell(7).value || "").trim();
    const rawLineItems = String(row.getCell(8).value || "").trim();

    if (!invoiceNumber && !customerEmail && !issueDate && !dueDate && !statusRaw && !taxRateRaw && !notes && !rawLineItems) return;

    rows.push({
      rowNumber,
      invoiceNumber,
      customerEmail,
      issueDate,
      dueDate,
      status,
      taxRate,
      notes,
      lineItems: parseImportedLineItems(rawLineItems),
    });
  });

  return rows;
};




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

const generateInvoicePdfBuffer = async ({ invoice, companyName = "Automora" }) => {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const bufferPromise = collectPdfBuffer(doc);

  const lineItems = parseLineItems(invoice?.line_items);
  const safeInvoiceNumber = String(invoice?.invoice_number || invoice?.id || "-");

  doc.rect(0, 0, doc.page.width, 120).fill("#f1f5f9");
  doc.rect(0, 0, doc.page.width, 80).fill("#4f46e5");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(24).text("Automora Invoice", 50, 28);
  doc.fontSize(11).font("Helvetica").text(`Invoice #${safeInvoiceNumber}`, 50, 56);

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(14).text("Invoice Details", 50, 140);

  let y = 165;
  drawRow({ doc, y, label: "Invoice Number", value: safeInvoiceNumber }); y += 34;
  drawRow({ doc, y, label: "Organization", value: String(companyName || "Automora") }); y += 34;
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


const escapeSpreadsheetXml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const buildInvoiceExcelBuffer = async ({ invoices }) => {
  const rows = [];
  rows.push('<?xml version="1.0"?>');
  rows.push('<?mso-application progid="Excel.Sheet"?>');
  rows.push('<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">');
  rows.push('<Worksheet ss:Name="Invoices">');
  rows.push('<Table>');

  const headerCells = ["Invoice Number", "Client", "Issue Date", "Due Date", "Status", "Tax Rate %", "Amount", "Notes"]
    .map((header) => `<Cell><Data ss:Type="String">${escapeSpreadsheetXml(header)}</Data></Cell>`)
    .join("");
  rows.push(`<Row>${headerCells}</Row>`);

  let grandTotal = 0;

  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    const amount = Number(invoice?.amount || 0);
    grandTotal += Number.isFinite(amount) ? amount : 0;

    const cells = [
      { type: "String", value: String(invoice?.invoice_number || "") },
      { type: "String", value: String(invoice?.client_name || "") },
      { type: "String", value: String(invoice?.issue_date || "").slice(0, 10) },
      { type: "String", value: String(invoice?.due_date || "").slice(0, 10) },
      { type: "String", value: String(invoice?.status || "") },
      { type: "Number", value: Number(invoice?.tax_rate || 0) },
      { type: "Number", value: Number.isFinite(amount) ? amount : 0 },
      { type: "String", value: String(invoice?.notes || "") },
    ];

    rows.push(`<Row>${cells.map((cell) => `<Cell><Data ss:Type="${cell.type}">${escapeSpreadsheetXml(cell.value)}</Data></Cell>`).join("")}</Row>`);
  }

  rows.push('<Row></Row>');
  rows.push(`<Row><Cell/><Cell/><Cell/><Cell/><Cell/><Cell/><Cell><Data ss:Type="Number">${grandTotal}</Data></Cell><Cell><Data ss:Type="String">Grand Total</Data></Cell></Row>`);
  rows.push('</Table>');
  rows.push('</Worksheet>');
  rows.push('</Workbook>');

  return Buffer.from(rows.join(""), "utf8");
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
    const buffer = await generateInvoicePdfBuffer({
      invoice,
      companyName: String(user?.organization_name || user?.name || "Automora"),
    });
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
        fileName: `invoices-report-${new Date().toISOString().slice(0, 10)}.xls`,
      },
    };
  } catch {
    return { status: 502, body: { message: "Unable to generate invoices Excel" } };
  }
};

export const importInvoicesExcelForUser = async (authHeader, payload = {}) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const fileData = String(payload?.fileData || "").trim();
  if (!fileData) return { status: 400, body: { message: "fileData is required" } };

  let buffer;
  try {
    buffer = Buffer.from(fileData, "base64");
  } catch {
    return { status: 400, body: { message: "Invalid fileData encoding" } };
  }

  let invoiceRows = [];
  try {
    invoiceRows = await parseInvoiceRowsFromExcelBuffer(buffer);
  } catch {
    return { status: 400, body: { message: "Unable to parse uploaded Excel file" } };
  }

  if (invoiceRows.length === 0) {
    return { status: 400, body: { message: "No invoice rows found in uploaded file" } };
  }

  const createdInvoices = [];
  const errors = [];
  const touchedCustomerIds = new Set();

  for (const row of invoiceRows) {
    if (!row.invoiceNumber || !row.customerEmail || !row.issueDate || !row.dueDate || row.lineItems.length === 0 || !Number.isFinite(row.taxRate) || row.taxRate < 0) {
      errors.push(`Row ${row.rowNumber}: required fields are missing or invalid`);
      continue;
    }

    const customer = await getCustomerByEmail({ userId: user.id, email: row.customerEmail });
    if (!customer) {
      errors.push(`Row ${row.rowNumber}: customer email not found (${row.customerEmail})`);
      continue;
    }

    try {
      const subtotal = row.lineItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.rate || 0)), 0);
      const computedAmount = Number((subtotal + (subtotal * row.taxRate) / 100).toFixed(2));

      const invoice = await createInvoice({
        id: createUserId(),
        userId: user.id,
        customerId: customer.id,
        invoiceNumber: row.invoiceNumber,
        clientName: customer.client,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
        amount: computedAmount,
        taxRate: row.taxRate,
        status: row.status,
        notes: row.notes,
        lineItems: row.lineItems,
      });

      createdInvoices.push(invoice);
      touchedCustomerIds.add(customer.id);
      await processInvoiceStatusChangeAutomations({ user, previousInvoice: null, invoice, customer });
    } catch {
      errors.push(`Row ${row.rowNumber}: invoice number already exists (${row.invoiceNumber})`);
    }
  }

  for (const customerId of touchedCustomerIds) {
    await syncCustomerRevenueById({ userId: user.id, customerId });
  }

  return {
    status: 200,
    body: {
      message: "Invoice upload completed",
      createdCount: createdInvoices.length,
      failedCount: errors.length,
      errors,
    },
  };
};


export const getInvoiceImportTemplateForUser = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Invoice Upload Template");

  sheet.columns = [
    { header: "invoice_number", key: "invoice_number", width: 20 },
    { header: "customer_email", key: "customer_email", width: 30 },
    { header: "issue_date", key: "issue_date", width: 15 },
    { header: "due_date", key: "due_date", width: 15 },
    { header: "status", key: "status", width: 14 },
    { header: "tax_rate", key: "tax_rate", width: 12 },
    { header: "notes", key: "notes", width: 36 },
    { header: "line_items", key: "line_items", width: 56 },
  ];

  sheet.addRow({
    invoice_number: "INV-1001",
    customer_email: "customer@example.com",
    issue_date: "2026-01-10",
    due_date: "2026-01-24",
    status: "Unpaid",
    tax_rate: 10,
    notes: "Onboarding invoice",
    line_items: "Consultation|1|1000;Implementation|1|500",
  });

  sheet.addRow({
    invoice_number: "",
    customer_email: "",
    issue_date: "",
    due_date: "",
    status: "",
    tax_rate: "",
    notes: "",
    line_items: "",
  });

  const noteRow = sheet.addRow({
    invoice_number: "Instructions",
    customer_email: "customer_email must already exist in customers",
    issue_date: "Use YYYY-MM-DD",
    due_date: "Use YYYY-MM-DD",
    status: "Unpaid/Pending/Paid/Overdue",
    tax_rate: "Number (amount is auto-calculated from line_items + tax_rate)",
    notes: "Optional",
    line_items: "Format: Description|Qty|Rate;Description|Qty|Rate",
  });
  noteRow.font = { italic: true };

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    status: 200,
    body: {
      buffer: Buffer.from(buffer),
      fileName: "invoice-upload-template.xlsx",
    },
  };
};


export const sendInvoiceEmailForUser = async (authHeader, invoiceId) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const targetInvoiceId = String(invoiceId || "").trim();
  if (!targetInvoiceId) return { status: 400, body: { message: "invoice id is required" } };

  const invoice = await getInvoiceWithCustomerByIdForAutomation({ userId: user.id, invoiceId: targetInvoiceId });
  if (!invoice) return { status: 404, body: { message: "invoice not found" } };

  const customerEmail = String(invoice?.customer_email || "").trim();
  if (!customerEmail) return { status: 400, body: { message: "customer email not found for this invoice" } };

  let buffer;
  try {
    buffer = await generateInvoicePdfBuffer({
      invoice,
      companyName: String(user?.organization_name || user?.name || "Automora"),
    });
  } catch {
    return { status: 502, body: { message: "Unable to generate invoice PDF" } };
  }

  const invoiceNumber = String(invoice?.invoice_number || invoice?.id || "invoice").trim() || "invoice";
  const clientName = String(invoice?.customer_name || invoice?.client_name || "Customer").trim() || "Customer";

  const result = await sendGmailEmail(authHeader, {
    to: customerEmail,
    subject: `Invoice ${invoiceNumber} from ${String(user?.organization_name || user?.name || "your company")}`.trim(),
    body: `Hi ${clientName},\n\nPlease find your invoice ${invoiceNumber} attached as a PDF file.\n\nThank you.`,
    attachments: [{
      filename: `invoice-${invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`,
      contentType: "application/pdf",
      contentBase64: buffer.toString("base64"),
    }],
  });

  if (result.status !== 200) {
    return result;
  }

  return {
    status: 200,
    body: {
      message: "Invoice email sent successfully",
      to: customerEmail,
      invoiceNumber,
      gmailMessageId: result?.body?.gmailMessageId || null,
    },
  };
};

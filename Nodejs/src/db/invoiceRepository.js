import { pool } from "./postgres.js";

const INVOICE_COLUMNS = [
  "id",
  "user_id",
  "customer_id",
  "invoice_number",
  "client_name",
  "issue_date",
  "due_date",
  "amount",
  "tax_rate",
  "status",
  "notes",
  "line_items",
  "created_at",
  "updated_at",
];

const invoiceSelect = (tableAlias = "") => INVOICE_COLUMNS.map((column) => `${tableAlias}${column}`).join(", ");

export const createInvoice = async ({
  id,
  userId,
  customerId,
  invoiceNumber,
  clientName,
  issueDate,
  dueDate,
  amount,
  taxRate,
  status,
  notes,
  lineItems,
}) => {
  const result = await pool.query(
    `INSERT INTO auth_invoices
      (id, user_id, customer_id, invoice_number, client_name, issue_date, due_date, amount, tax_rate, status, notes, line_items)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     RETURNING ${invoiceSelect()}`,
    [id, userId, customerId, invoiceNumber, clientName, issueDate, dueDate, amount, taxRate, status, notes, JSON.stringify(lineItems || [])],
  );

  return result.rows[0] ?? null;
};

export const listInvoicesByUserId = async ({ userId, invoiceNumber, fromDate, toDate }) => {
  const result = await pool.query(
    `SELECT ${invoiceSelect()}
     FROM auth_invoices
     WHERE user_id = $1
       AND ($2::text = '' OR invoice_number ILIKE '%' || $2 || '%')
       AND ($3::date IS NULL OR issue_date >= $3::date)
       AND ($4::date IS NULL OR issue_date <= $4::date)
     ORDER BY issue_date DESC, created_at DESC`,
    [userId, invoiceNumber || "", fromDate || null, toDate || null],
  );

  return result.rows;
};

export const updateInvoiceById = async ({
  invoiceId,
  userId,
  customerId,
  invoiceNumber,
  clientName,
  issueDate,
  dueDate,
  amount,
  taxRate,
  status,
  notes,
  lineItems,
}) => {
  const result = await pool.query(
    `UPDATE auth_invoices
     SET customer_id = $1,
         invoice_number = $2,
         client_name = $3,
         issue_date = $4,
         due_date = $5,
         amount = $6,
         tax_rate = $7,
         status = $8,
         notes = $9,
         line_items = $10::jsonb,
         updated_at = NOW()
     WHERE id = $11 AND user_id = $12
     RETURNING ${invoiceSelect()}`,
    [customerId, invoiceNumber, clientName, issueDate, dueDate, amount, taxRate, status, notes, JSON.stringify(lineItems || []), invoiceId, userId],
  );

  return result.rows[0] ?? null;
};


export const getInvoiceById = async ({ invoiceId, userId }) => {
  const result = await pool.query(
    `SELECT ${invoiceSelect()}
     FROM auth_invoices
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [invoiceId, userId],
  );

  return result.rows[0] ?? null;
};


export const getInvoiceWithCustomerByIdForAutomation = async ({ userId, invoiceId }) => {
  const result = await pool.query(
    `SELECT
      i.id, i.user_id, i.customer_id, i.invoice_number, i.client_name, i.issue_date, i.due_date, i.amount, i.tax_rate, i.status, i.notes, i.line_items, i.created_at, i.updated_at,
      c.id AS customer_ref_id,
      c.name AS customer_name,
      c.email AS customer_email,
      c.contact AS customer_contact,
      c.client AS customer_client,
      c.status AS customer_status,
      c.value AS customer_value
     FROM auth_invoices i
     LEFT JOIN auth_customers c
       ON c.id = i.customer_id
      AND c.user_id = i.user_id
     WHERE i.user_id = $1
       AND i.id = $2
     LIMIT 1`,
    [userId, invoiceId],
  );

  return result.rows[0] ?? null;
};

export const getPaidRevenueByCustomerId = async ({ userId, customerId }) => {
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS paid_revenue
     FROM auth_invoices
     WHERE user_id = $1
       AND customer_id = $2
       AND status = 'Paid'`,
    [userId, customerId],
  );

  return Number(result.rows[0]?.paid_revenue || 0);
};

export const deleteInvoiceById = async ({ invoiceId, userId }) => {
  const result = await pool.query(
    `DELETE FROM auth_invoices
     WHERE id = $1 AND user_id = $2`,
    [invoiceId, userId],
  );

  return result.rowCount > 0;
};


export const markOverdueInvoicesByUserId = async (userId) => {
  const result = await pool.query(
    `UPDATE auth_invoices
     SET status = 'Overdue',
         updated_at = NOW()
     WHERE user_id = $1
       AND due_date < CURRENT_DATE
       AND LOWER(status) <> 'paid'
       AND LOWER(status) <> 'overdue'
     RETURNING ${invoiceSelect()}`,
    [userId],
  );

  return result.rows;
};

export const getInvoiceInsightsByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT
      COALESCE(SUM(CASE WHEN status = 'Paid' THEN amount END), 0)::numeric(12,2) AS total_paid,
      COALESCE(SUM(CASE WHEN status = 'Overdue' THEN amount END), 0)::numeric(12,2) AS total_overdue,
      COALESCE(SUM(CASE WHEN status = 'Unpaid' OR status = 'Draft' THEN amount END), 0)::numeric(12,2) AS total_unpaid,
      COALESCE(SUM(CASE WHEN status = 'Paid' OR status = 'Unpaid' OR status = 'Draft' THEN amount END), 0)::numeric(12,2) AS total_revenue,
      COUNT(*)::int AS total_invoices
     FROM auth_invoices
     WHERE user_id = $1`,
    [userId],
  );

  return result.rows[0] ?? { total_paid: 0, total_overdue: 0, total_unpaid: 0, total_revenue: 0, total_invoices: 0 };
};


export const listInvoicesForAutomation = async ({ userId, statuses = [], dueDate = null }) => {
  const normalizedStatuses = Array.isArray(statuses) ? statuses.filter(Boolean) : [];

  const result = await pool.query(
    `SELECT
      i.id, i.user_id, i.customer_id, i.invoice_number, i.client_name, i.issue_date, i.due_date, i.amount, i.status, i.created_at, i.updated_at,
      c.email AS customer_email,
      c.name AS customer_name
     FROM auth_invoices i
     LEFT JOIN auth_customers c
       ON c.id = i.customer_id
      AND c.user_id = i.user_id
     WHERE i.user_id = $1
       AND ($2::text[] = '{}'::text[] OR i.status = ANY($2::text[]))
       AND ($3::date IS NULL OR i.due_date = $3::date)
     ORDER BY i.created_at DESC`,
    [userId, normalizedStatuses, dueDate || null],
  );

  return result.rows;
};


export const getInvoiceByNumberForUser = async ({ userId, invoiceNumber }) => {
  const normalized = String(invoiceNumber || "").trim();
  if (!userId || !normalized) return null;

  const result = await pool.query(
    `SELECT ${invoiceSelect()}
     FROM auth_invoices
     WHERE user_id = $1
       AND LOWER(invoice_number) = LOWER($2)
     LIMIT 1`,
    [userId, normalized],
  );

  return result.rows[0] ?? null;
};

export const getLatestInvoiceForCustomerEmail = async ({ userId, customerEmail }) => {
  const normalized = String(customerEmail || "").trim().toLowerCase();
  if (!userId || !normalized) return null;

  const result = await pool.query(
    `SELECT ${invoiceSelect("i.")}
     FROM auth_invoices i
     LEFT JOIN auth_customers c
       ON c.id = i.customer_id
      AND c.user_id = i.user_id
     WHERE i.user_id = $1
       AND LOWER(COALESCE(c.email, '')) = $2
     ORDER BY i.issue_date DESC, i.created_at DESC
     LIMIT 1`,
    [userId, normalized],
  );

  return result.rows[0] ?? null;
};


export const countInvoicesByCustomerId = async ({ userId, customerId }) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM auth_invoices
     WHERE user_id = $1
       AND customer_id = $2`,
    [userId, customerId],
  );

  return Number(result.rows[0]?.total || 0);
};

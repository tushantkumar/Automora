import { pool } from "./postgres.js";

const AUTOMATION_SELECT = `
  id,
  user_id,
  name,
  trigger_type,
  sub_trigger,
  condition_logic,
  conditions,
  action_type,
  action_sub_type,
  mail_template_id,
  is_active,
  created_at,
  updated_at
`;

const DATA_TYPE_MAP = {
  text: "string",
  varchar: "string",
  "character varying": "string",
  uuid: "string",
  numeric: "number",
  integer: "number",
  bigint: "number",
  smallint: "number",
  date: "date",
  timestamp: "date",
  "timestamp with time zone": "date",
  "timestamp without time zone": "date",
  boolean: "boolean",
};

const tableToEntity = {
  auth_customers: "customer",
  auth_invoices: "invoice",
};

export const getAutomationEntityFields = async () => {
  const result = await pool.query(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('auth_customers', 'auth_invoices')
     ORDER BY table_name, ordinal_position ASC`,
  );

  return result.rows
    .filter((row) => row.column_name !== "user_id")
    .map((row) => ({
      entity: tableToEntity[row.table_name],
      key: row.column_name,
      label: row.column_name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      dataType: DATA_TYPE_MAP[row.data_type] || "string",
    }));
};

export const getAutomationByName = async ({ userId, name }) => {
  const result = await pool.query(
    `SELECT ${AUTOMATION_SELECT}
     FROM auth_automations
     WHERE user_id = $1
       AND LOWER(name) = LOWER($2)
     LIMIT 1`,
    [userId, String(name || "").trim()],
  );
  return result.rows[0] ?? null;
};

export const createAutomation = async ({
  id,
  userId,
  name,
  triggerType,
  subTrigger,
  conditionLogic,
  conditions,
  actionType,
  actionSubType,
  mailTemplateId,
  isActive,
}) => {
  const result = await pool.query(
    `INSERT INTO auth_automations
      (id, user_id, name, trigger_type, sub_trigger, condition_logic, conditions, action_type, action_sub_type, mail_template_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
     RETURNING ${AUTOMATION_SELECT}`,
    [
      id,
      userId,
      name,
      triggerType,
      subTrigger,
      conditionLogic,
      JSON.stringify(conditions),
      actionType,
      actionSubType,
      mailTemplateId,
      Boolean(isActive),
    ],
  );

  return result.rows[0] ?? null;
};

export const listAutomationsByUserId = async ({ userId, limit = 10, offset = 0 }) => {
  const [rows, countResult] = await Promise.all([
    pool.query(
      `SELECT ${AUTOMATION_SELECT}
       FROM auth_automations
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM auth_automations
       WHERE user_id = $1`,
      [userId],
    ),
  ]);

  return {
    rows: rows.rows,
    total: Number(countResult.rows[0]?.total || 0),
  };
};

export const setAutomationActiveState = async ({ automationId, userId, isActive }) => {
  const result = await pool.query(
    `UPDATE auth_automations
     SET is_active = $1,
         updated_at = NOW()
     WHERE id = $2
       AND user_id = $3
     RETURNING ${AUTOMATION_SELECT}`,
    [Boolean(isActive), automationId, userId],
  );

  return result.rows[0] ?? null;
};

export const listActiveAutomationsByTrigger = async ({ triggerType, subTrigger = null }) => {
  const result = await pool.query(
    `SELECT ${AUTOMATION_SELECT}
     FROM auth_automations
     WHERE is_active = TRUE
       AND trigger_type = $1
       AND ($2::text IS NULL OR sub_trigger = $2)
     ORDER BY created_at DESC`,
    [triggerType, subTrigger],
  );

  return result.rows;
};

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
}) => {
  const result = await pool.query(
    `INSERT INTO auth_automations
      (id, user_id, name, trigger_type, sub_trigger, condition_logic, conditions, action_type, action_sub_type, mail_template_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, true)
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
    ],
  );

  return result.rows[0] ?? null;
};

export const listAutomationsByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT ${AUTOMATION_SELECT}
     FROM auth_automations
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );

  return result.rows;
};

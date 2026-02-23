import { pool } from "./postgres.js";

const AUTOMATION_SELECT = `id, user_id, name, description, trigger_type, action_type, action_sub_type, action_payload, is_active, created_at, updated_at`;

export const createAutomation = async ({
  id,
  userId,
  name,
  description,
  triggerType,
  actionType,
  actionSubType,
  actionPayload,
  isActive,
}) => {
  const result = await pool.query(
    `INSERT INTO auth_automations
      (id, user_id, name, description, trigger_type, action_type, action_sub_type, action_payload, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     RETURNING ${AUTOMATION_SELECT}`,
    [id, userId, name, description, triggerType, actionType, actionSubType, JSON.stringify(actionPayload || {}), isActive],
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

export const getAutomationById = async ({ automationId, userId }) => {
  const result = await pool.query(
    `SELECT ${AUTOMATION_SELECT}
     FROM auth_automations
     WHERE id = $1 AND user_id = $2`,
    [automationId, userId],
  );

  return result.rows[0] ?? null;
};

export const deleteAutomationById = async ({ automationId, userId }) => {
  const result = await pool.query(
    `DELETE FROM auth_automations
     WHERE id = $1 AND user_id = $2`,
    [automationId, userId],
  );

  return result.rowCount > 0;
};

export const replaceAutomationConditions = async ({ automationId, userId, conditions }) => {
  await pool.query(`DELETE FROM auth_automation_conditions WHERE automation_id = $1 AND user_id = $2`, [automationId, userId]);

  if (!Array.isArray(conditions) || !conditions.length) return;

  for (let index = 0; index < conditions.length; index += 1) {
    const condition = conditions[index];
    await pool.query(
      `INSERT INTO auth_automation_conditions
        (id, automation_id, user_id, field_key, operator, value_text, joiner, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        condition.id,
        automationId,
        userId,
        condition.field,
        condition.operator,
        condition.value,
        condition.joiner,
        index,
      ],
    );
  }
};

export const listAutomationConditions = async ({ automationId, userId }) => {
  const result = await pool.query(
    `SELECT id, field_key, operator, value_text, joiner, order_index
     FROM auth_automation_conditions
     WHERE automation_id = $1 AND user_id = $2
     ORDER BY order_index ASC`,
    [automationId, userId],
  );

  return result.rows;
};

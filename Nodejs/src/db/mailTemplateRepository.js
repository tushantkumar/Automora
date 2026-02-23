import { pool } from "./postgres.js";

const MAIL_TEMPLATE_SELECT = `id, user_id, name, subject, body, created_at, updated_at`;

export const listMailTemplatesByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT ${MAIL_TEMPLATE_SELECT}
     FROM auth_mail_templates
     WHERE user_id = $1
     ORDER BY updated_at DESC, created_at DESC`,
    [userId],
  );

  return result.rows;
};

export const createMailTemplate = async ({ id, userId, name, subject, body }) => {
  const result = await pool.query(
    `INSERT INTO auth_mail_templates (id, user_id, name, subject, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${MAIL_TEMPLATE_SELECT}`,
    [id, userId, name, subject, body],
  );

  return result.rows[0] ?? null;
};

export const updateMailTemplateById = async ({ templateId, userId, name, subject, body }) => {
  const result = await pool.query(
    `UPDATE auth_mail_templates
     SET name = $1,
         subject = $2,
         body = $3,
         updated_at = NOW()
     WHERE id = $4 AND user_id = $5
     RETURNING ${MAIL_TEMPLATE_SELECT}`,
    [name, subject, body, templateId, userId],
  );

  return result.rows[0] ?? null;
};

export const deleteMailTemplateById = async ({ templateId, userId }) => {
  const result = await pool.query(
    `DELETE FROM auth_mail_templates
     WHERE id = $1 AND user_id = $2`,
    [templateId, userId],
  );

  return result.rowCount > 0;
};

export const getMailTemplateById = async ({ templateId, userId }) => {
  const result = await pool.query(
    `SELECT ${MAIL_TEMPLATE_SELECT}
     FROM auth_mail_templates
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [templateId, userId],
  );

  return result.rows[0] ?? null;
};

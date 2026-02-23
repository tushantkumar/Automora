import { createUserId } from "../utils/auth.js";
import { pool } from "./postgres.js";

const DRAFT_EMAIL_SELECT = `id, user_id, automation_id, recipient_email, subject, body, created_at`;

export const createDraftEmail = async ({ userId, automationId, to, subject, body }) => {
  const result = await pool.query(
    `INSERT INTO auth_draft_emails (id, user_id, automation_id, recipient_email, subject, body)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${DRAFT_EMAIL_SELECT}`,
    [createUserId(), userId, automationId, to, subject, body],
  );

  return result.rows[0] ?? null;
};

import { createUserId } from "../utils/auth.js";
import { pool } from "./postgres.js";

export const upsertEmailIntegration = async ({
  userId,
  provider,
  accessToken,
  refreshToken,
  tokenExpiry,
  connectedEmail,
}) => {
  const result = await pool.query(
    `INSERT INTO auth_email_integrations
      (id, user_id, provider, access_token, refresh_token, token_expiry, connected_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, provider)
     DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       token_expiry = EXCLUDED.token_expiry,
       connected_email = EXCLUDED.connected_email,
       updated_at = NOW()
     RETURNING id, user_id, provider, connected_email, token_expiry, created_at, updated_at`,
    [createUserId(), userId, provider, accessToken, refreshToken, tokenExpiry, connectedEmail],
  );

  return result.rows[0] ?? null;
};

export const getEmailIntegrationByProvider = async ({ userId, provider }) => {
  const result = await pool.query(
    `SELECT id, user_id, provider, access_token, refresh_token, token_expiry, connected_email, created_at, updated_at
     FROM auth_email_integrations
     WHERE user_id = $1 AND provider = $2
     LIMIT 1`,
    [userId, provider],
  );

  return result.rows[0] ?? null;
};

export const listEmailIntegrationsByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT provider, connected_email, token_expiry, created_at, updated_at
     FROM auth_email_integrations
     WHERE user_id = $1
     ORDER BY provider ASC`,
    [userId],
  );

  return result.rows;
};

export const upsertInboxEmails = async ({ userId, provider, emails }) => {
  if (!Array.isArray(emails) || emails.length === 0) return 0;

  let upserted = 0;
  for (const email of emails) {
    const result = await pool.query(
      `INSERT INTO auth_inbox_emails
        (id, user_id, provider, external_id, from_name, from_email, subject, snippet, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, provider, external_id)
       DO UPDATE SET
         from_name = EXCLUDED.from_name,
         from_email = EXCLUDED.from_email,
         subject = EXCLUDED.subject,
         snippet = EXCLUDED.snippet,
         received_at = EXCLUDED.received_at,
         updated_at = NOW()`,
      [
        createUserId(),
        userId,
        provider,
        email.externalId,
        email.fromName,
        email.fromEmail,
        email.subject,
        email.snippet,
        email.receivedAt,
      ],
    );

    upserted += result.rowCount;
  }

  return upserted;
};



export const getInboxEmailByExternalId = async ({ userId, provider, externalId }) => {
  const result = await pool.query(
    `SELECT id, user_id, provider, external_id, from_name, from_email, subject, snippet, replied_at, received_at, created_at, updated_at
     FROM auth_inbox_emails
     WHERE user_id = $1
       AND provider = $2
       AND external_id = $3
     LIMIT 1`,
    [userId, provider, externalId],
  );

  return result.rows[0] ?? null;
};

export const markInboxEmailReplied = async ({ userId, provider, externalId }) => {
  const result = await pool.query(
    `UPDATE auth_inbox_emails
     SET replied_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1
       AND provider = $2
       AND external_id = $3
       AND replied_at IS NULL`,
    [userId, provider, externalId],
  );

  return result.rowCount > 0;
};

export const listInboxEmailsByUserId = async ({ userId, search = "" }) => {
  const result = await pool.query(
    `SELECT id, provider, external_id, from_name, from_email, subject, snippet, replied_at, received_at, created_at, updated_at
     FROM auth_inbox_emails
     WHERE user_id = $1
       AND ($2::text = '' OR subject ILIKE '%' || $2 || '%' OR from_name ILIKE '%' || $2 || '%' OR from_email ILIKE '%' || $2 || '%')
     ORDER BY received_at DESC, created_at DESC`,
    [userId, search],
  );

  return result.rows;
};


export const deleteEmailIntegrationByProvider = async ({ userId, provider }) => {
  const result = await pool.query(
    `DELETE FROM auth_email_integrations
     WHERE user_id = $1 AND provider = $2`,
    [userId, provider],
  );

  return result.rowCount > 0;
};

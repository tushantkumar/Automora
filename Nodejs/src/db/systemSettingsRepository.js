import { pool } from "./postgres.js";

export const getSystemSettingsByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT user_id, smtp_from, updated_at
     FROM auth_system_settings
     WHERE user_id = $1`,
    [userId],
  );

  return result.rows[0] || null;
};

export const upsertSystemSettingsByUserId = async ({ userId, smtpFrom }) => {
  const result = await pool.query(
    `INSERT INTO auth_system_settings (user_id, smtp_from, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       smtp_from = EXCLUDED.smtp_from,
       updated_at = NOW()
     RETURNING user_id, smtp_from, updated_at`,
    [userId, smtpFrom || null],
  );

  return result.rows[0] || null;
};

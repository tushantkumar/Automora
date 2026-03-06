import { pool } from "./postgres.js";

const VERIFICATION_EXPIRY_INTERVAL = "24 hours";
const PASSWORD_RESET_EXPIRY_INTERVAL = "1 hour";

const USER_SELECT = `SELECT
  u.id,
  u.name,
  u.email,
  u.password_hash,
  u.is_verified,
  u.status,
  u.platform_tier,
  u.subscription_plan,
  u.role,
  u.invited_by,
  u.invited_at,
  u.invitation_accepted_at,
  u.is_disabled,
  u.created_at,
  o.organization_name,
  (u.invited_by IS NOT NULL OR EXISTS (SELECT 1 FROM auth_onboarding_details od WHERE od.user_id = u.id)) AS onboarding_completed
FROM auth_users u
LEFT JOIN auth_onboarding_details o ON o.user_id = u.id`;

export const getUserByEmail = async (email) => {
  const res = await pool.query(
    `${USER_SELECT}
     WHERE u.email = $1`,
    [email],
  );

  return res.rows[0] ?? null;
};

export const getUserById = async (userId) => {
  const res = await pool.query(
    `${USER_SELECT}
     WHERE u.id = $1`,
    [userId],
  );

  return res.rows[0] ?? null;
};

export const createUserWithVerificationToken = async ({ id, name, email, passwordHash, verificationToken }) => {
  await pool.query("BEGIN");

  try {
    const inserted = await pool.query(
      `INSERT INTO auth_users (id, name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, is_verified, status, platform_tier, subscription_plan, role, invited_by, invited_at, invitation_accepted_at, is_disabled, created_at, NULL::TEXT AS organization_name, FALSE AS onboarding_completed`,
      [id, name, email, passwordHash],
    );

    await pool.query("INSERT INTO auth_verification_tokens (token, email) VALUES ($1, $2)", [verificationToken, email]);

    await pool.query("COMMIT");
    return inserted.rows[0];
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
};

export const createInvitedUser = async ({ id, name, email, passwordHash, role, invitedBy, invitedAt, invitationAcceptedAt }) => {
  const res = await pool.query(
    `INSERT INTO auth_users (
      id, name, email, password_hash, is_verified, status, role, invited_by, invited_at, invitation_accepted_at, created_at
    )
     VALUES ($1, $2, $3, $4, TRUE, 'Active', $5, $6, $7, $8, NOW())
     RETURNING id`,
    [id, name, email, passwordHash, role, invitedBy, invitedAt, invitationAcceptedAt],
  );

  return res.rows[0] ?? null;
};

export const updateUserRoleById = async ({ userId, role }) => {
  const res = await pool.query(
    `UPDATE auth_users
     SET role = $2
     WHERE id = $1
     RETURNING id, role`,
    [userId, role],
  );

  return res.rows[0] ?? null;
};

export const disableUserById = async ({ userId, disabled }) => {
  const res = await pool.query(
    `UPDATE auth_users
     SET is_disabled = $2,
         status = CASE WHEN $2 THEN 'Disabled' ELSE 'Active' END
     WHERE id = $1
     RETURNING id, is_disabled, status`,
    [userId, disabled],
  );

  return res.rows[0] ?? null;
};

export const listManagedUsers = async (inviterUserId) => {
  const res = await pool.query(
    `SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.status,
      u.is_disabled,
      u.created_at,
      u.invited_at,
      u.invitation_accepted_at
     FROM auth_users u
     WHERE u.invited_by = $1
     ORDER BY COALESCE(u.invited_at, u.created_at) DESC`,
    [inviterUserId],
  );

  return res.rows;
};

export const listPendingInvites = async (inviterUserId) => {
  const res = await pool.query(
    `SELECT
      id,
      invited_name,
      invited_email,
      role,
      expires_at,
      created_at,
      used_at,
      disabled_at,
      last_sent_at,
      expires_at < NOW() AS is_expired
     FROM auth_user_invites
     WHERE inviter_user_id = $1
       AND used_at IS NULL
       AND disabled_at IS NULL
     ORDER BY created_at DESC`,
    [inviterUserId],
  );

  return res.rows;
};

export const upsertInvite = async ({ id, inviterUserId, invitedName, invitedEmail, role, tokenHash, expiresAt }) => {
  const res = await pool.query(
    `INSERT INTO auth_user_invites (
      id, inviter_user_id, invited_name, invited_email, role, token_hash, expires_at, created_at, last_sent_at
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (inviter_user_id, invited_email)
     DO UPDATE SET
       invited_name = EXCLUDED.invited_name,
       role = EXCLUDED.role,
       token_hash = EXCLUDED.token_hash,
       expires_at = EXCLUDED.expires_at,
       used_at = NULL,
       disabled_at = NULL,
       last_sent_at = NOW()
     RETURNING id, inviter_user_id, invited_name, invited_email, role, expires_at, created_at, used_at, disabled_at, last_sent_at`,
    [id, inviterUserId, invitedName, invitedEmail, role, tokenHash, expiresAt],
  );

  return res.rows[0] ?? null;
};

export const getInviteByTokenHash = async (tokenHash) => {
  const res = await pool.query(
    `SELECT
      id,
      inviter_user_id,
      invited_name,
      invited_email,
      role,
      token_hash,
      expires_at,
      created_at,
      used_at,
      disabled_at,
      last_sent_at,
      expires_at < NOW() AS is_expired
     FROM auth_user_invites
     WHERE token_hash = $1`,
    [tokenHash],
  );

  return res.rows[0] ?? null;
};

export const getInviteByEmail = async ({ inviterUserId, invitedEmail }) => {
  const res = await pool.query(
    `SELECT
      id,
      inviter_user_id,
      invited_name,
      invited_email,
      role,
      token_hash,
      expires_at,
      created_at,
      used_at,
      disabled_at,
      last_sent_at,
      expires_at < NOW() AS is_expired
     FROM auth_user_invites
     WHERE inviter_user_id = $1
       AND invited_email = $2
       AND used_at IS NULL
       AND disabled_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [inviterUserId, invitedEmail],
  );

  return res.rows[0] ?? null;
};

export const markInviteUsed = async (inviteId) => {
  await pool.query(
    `UPDATE auth_user_invites
     SET used_at = NOW()
     WHERE id = $1`,
    [inviteId],
  );
};

export const deleteUserByEmail = async (email) => {
  await pool.query("DELETE FROM auth_users WHERE email = $1", [email]);
};

export const getVerificationTokenDetails = async (token) => {
  const res = await pool.query(
    `SELECT
       vt.email,
       vt.created_at,
       vt.created_at < NOW() - INTERVAL '${VERIFICATION_EXPIRY_INTERVAL}' AS is_expired
     FROM auth_verification_tokens vt
     WHERE vt.token = $1`,
    [token],
  );

  return res.rows[0] ?? null;
};

export const verifyUserEmailAndCreateSession = async ({ email, verificationToken, sessionToken }) => {
  await pool.query("BEGIN");

  try {
    const updatedUser = await pool.query(
      `UPDATE auth_users
       SET is_verified = TRUE
       WHERE email = $1
       RETURNING id, name, email, is_verified, status, platform_tier, subscription_plan, role, invited_by, invited_at, invitation_accepted_at, is_disabled, created_at`,
      [email],
    );

    if (!updatedUser.rowCount) {
      await pool.query("ROLLBACK");
      return null;
    }

    const hydrated = await pool.query(
      `${USER_SELECT}
       WHERE u.id = $1`,
      [updatedUser.rows[0].id],
    );

    await pool.query("DELETE FROM auth_verification_tokens WHERE token = $1", [verificationToken]);
    await pool.query("INSERT INTO auth_sessions (token, user_id) VALUES ($1, $2)", [sessionToken, updatedUser.rows[0].id]);

    await pool.query("COMMIT");
    return hydrated.rows[0] ?? null;
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
};

export const createSession = async ({ token, userId }) => {
  await pool.query("INSERT INTO auth_sessions (token, user_id) VALUES ($1, $2)", [token, userId]);
};

export const getUserBySessionToken = async (token) => {
  const res = await pool.query(
    `SELECT
      u.id,
      u.name,
      u.email,
      u.is_verified,
      u.status,
      u.platform_tier,
      u.subscription_plan,
      u.role,
      u.invited_by,
      u.invited_at,
      u.invitation_accepted_at,
      u.is_disabled,
      u.created_at,
      o.organization_name,
      (u.invited_by IS NOT NULL OR EXISTS (SELECT 1 FROM auth_onboarding_details od WHERE od.user_id = u.id)) AS onboarding_completed
     FROM auth_sessions s
     JOIN auth_users u ON s.user_id = u.id
     LEFT JOIN auth_onboarding_details o ON o.user_id = u.id
     WHERE s.token = $1`,
    [token],
  );

  return res.rows[0] ?? null;
};

export const purgeExpiredUnverifiedUsers = async () => {
  const res = await pool.query(
    `DELETE FROM auth_users u
     WHERE u.is_verified = FALSE
       AND EXISTS (
         SELECT 1
         FROM auth_verification_tokens vt
         WHERE vt.email = u.email
           AND vt.created_at < NOW() - INTERVAL '${VERIFICATION_EXPIRY_INTERVAL}'
       )`,
  );

  return res.rowCount || 0;
};

export const upsertPasswordResetToken = async ({ email, token }) => {
  await pool.query(
    `INSERT INTO auth_password_reset_tokens (token, email)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET token = EXCLUDED.token, created_at = NOW()`,
    [token, email],
  );
};

export const getPasswordResetTokenDetails = async (token) => {
  const res = await pool.query(
    `SELECT
       prt.email,
       prt.created_at,
       prt.created_at < NOW() - INTERVAL '${PASSWORD_RESET_EXPIRY_INTERVAL}' AS is_expired
     FROM auth_password_reset_tokens prt
     WHERE prt.token = $1`,
    [token],
  );

  return res.rows[0] ?? null;
};

export const resetPasswordByToken = async ({ token, email, passwordHash }) => {
  await pool.query("BEGIN");

  try {
    const updated = await pool.query(
      `UPDATE auth_users
       SET password_hash = $1
       WHERE email = $2
       RETURNING id`,
      [passwordHash, email],
    );

    if (!updated.rowCount) {
      await pool.query("ROLLBACK");
      return false;
    }

    await pool.query("DELETE FROM auth_password_reset_tokens WHERE token = $1", [token]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id = $1", [updated.rows[0].id]);

    await pool.query("COMMIT");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
};

export const deletePasswordResetToken = async (token) => {
  await pool.query("DELETE FROM auth_password_reset_tokens WHERE token = $1", [token]);
};

export const upsertOnboardingDetails = async ({
  userId,
  industry,
  businessBio,
  organizationName,
  clientsCount,
  automationUse,
  selectedAutomations,
}) => {
  await pool.query(
    `INSERT INTO auth_onboarding_details
      (user_id, industry, business_bio, organization_name, clients_count, automation_use, selected_automations)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (user_id)
     DO UPDATE SET
       industry = EXCLUDED.industry,
       business_bio = EXCLUDED.business_bio,
       organization_name = EXCLUDED.organization_name,
       clients_count = EXCLUDED.clients_count,
       automation_use = EXCLUDED.automation_use,
       selected_automations = EXCLUDED.selected_automations,
       updated_at = NOW()`,
    [userId, industry, businessBio, organizationName, clientsCount, automationUse, JSON.stringify(selectedAutomations)],
  );
};

export const upsertOrganizationNameByUserId = async ({ userId, organizationName }) => {
  await pool.query(
    `INSERT INTO auth_onboarding_details (user_id, organization_name, selected_automations, updated_at)
     VALUES ($1, $2, '[]'::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       organization_name = EXCLUDED.organization_name,
       updated_at = NOW()`,
    [userId, organizationName],
  );
};

export const getOnboardingDetailsByUserId = async (userId) => {
  const res = await pool.query(
    `SELECT
      industry,
      business_bio,
      organization_name,
      clients_count,
      automation_use,
      selected_automations,
      updated_at
     FROM auth_onboarding_details
     WHERE user_id = $1`,
    [userId],
  );

  return res.rows[0] ?? null;
};

export const listUsersForAutomation = async () => {
  const res = await pool.query(
    `SELECT
      u.id,
      u.name,
      u.email,
      o.organization_name
     FROM auth_users u
     LEFT JOIN auth_onboarding_details o ON o.user_id = u.id
     WHERE u.is_verified = TRUE
       AND u.is_disabled = FALSE`,
  );

  return res.rows;
};

export const upsertAccountDeleteOtp = async ({ userId, otpHash, expiresAt }) => {
  await pool.query(
    `INSERT INTO auth_account_delete_otps (user_id, otp_hash, expires_at, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       otp_hash = EXCLUDED.otp_hash,
       expires_at = EXCLUDED.expires_at,
       created_at = NOW()`,
    [userId, otpHash, expiresAt],
  );
};

export const getAccountDeleteOtpDetails = async (userId) => {
  const res = await pool.query(
    `SELECT
      user_id,
      otp_hash,
      expires_at,
      created_at,
      expires_at < NOW() AS is_expired
     FROM auth_account_delete_otps
     WHERE user_id = $1`,
    [userId],
  );

  return res.rows[0] ?? null;
};

export const deleteAccountDeleteOtp = async (userId) => {
  await pool.query("DELETE FROM auth_account_delete_otps WHERE user_id = $1", [userId]);
};

export const deleteUserAccountById = async (userId) => {
  await pool.query("DELETE FROM auth_users WHERE id = $1", [userId]);
};

export const purgeExpiredAccountDeleteOtps = async () => {
  const res = await pool.query(
    `DELETE FROM auth_account_delete_otps
     WHERE expires_at < NOW() - INTERVAL '1 minute'`,
  );

  return res.rowCount || 0;
};

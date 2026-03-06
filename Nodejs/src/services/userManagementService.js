import crypto from "node:crypto";
import {
  createInvitedUser,
  createSession,
  disableUserById,
  getInviteByEmail,
  getInviteByTokenHash,
  getUserByEmail,
  getUserById,
  getUserBySessionToken,
  upsertOrganizationNameByUserId,
  listManagedUsers,
  listPendingInvites,
  listUsersByWorkspaceId,
  markInviteUsed,
  updateUserRoleById,
  upsertInvite,
  deleteUserAccountById,
} from "../db/authRepository.js";
import { APP_BASE_URL } from "../config/constants.js";
import { createToken, createUserId, hashPassword, normalizeEmail } from "../utils/auth.js";
import { APP_ROLES, canManageUsers, normalizeRole } from "./rbacService.js";
import { sendGmailEmail } from "./emailIntegrationService.js";

const INVITE_EXPIRY_HOURS = 24;
const INVITE_EXPIRY_MS = INVITE_EXPIRY_HOURS * 60 * 60 * 1000;
const INVITE_RATE_LIMIT_MAX = 5;
const INVITE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const inviteRateLimitMap = new Map();

const readBearerToken = (authHeader) =>
  String(authHeader || "").startsWith("Bearer ") ? String(authHeader).slice(7) : "";

const getAuthorizedUser = async (authHeader) => {
  const token = readBearerToken(authHeader);
  if (!token) return null;
  return getUserBySessionToken(token);
};

const tokenHash = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");

const sendInviteMessage = async ({ authHeader, inviteeEmail, inviterName, inviteeName, role, activationLink }) => {
  const inviterDisplayName = String(inviterName || "Admin").trim() || "Admin";
  const inviteeDisplayName = String(inviteeName || "there").trim() || "there";
  const subject = `You're invited to join ${inviterDisplayName}'s Automora workspace`;
  const text = [
    `Hi ${inviteeDisplayName},`,
    "",
    `${inviterDisplayName} invited you to join their Automora workspace as ${role}.`,
    `Activate your account using this secure link: ${activationLink}`,
    `This link expires in ${INVITE_EXPIRY_HOURS} hours.`,
    "",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n");

  const html = `
  <div style="background:#f5f7fb;padding:24px 0;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#ffffff;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;">You're invited to Automora</h1>
                <p style="margin:8px 0 0 0;font-size:14px;opacity:0.95;">Join ${inviterDisplayName}'s workspace as <strong>${role}</strong></p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;">
                <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;">Hi ${inviteeDisplayName},</p>
                <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;">${inviterDisplayName} has invited you to collaborate in Automora. Click the button below to activate your account securely.</p>
                <p style="margin:0 0 24px 0;text-align:center;">
                  <a href="${activationLink}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Activate account</a>
                </p>
                <div style="padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;margin-bottom:18px;">
                  <p style="margin:0 0 6px 0;font-size:13px;color:#334155;"><strong>Activation link:</strong></p>
                  <p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;"><a href="${activationLink}" style="color:#2563eb;">${activationLink}</a></p>
                </div>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;">This secure invite link expires in <strong>${INVITE_EXPIRY_HOURS} hours</strong> and can only be used once.</p>
                <p style="margin:14px 0 0 0;font-size:12px;line-height:1.6;color:#64748b;">If you did not expect this invitation, you can safely ignore this email.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
                <p style="margin:0;font-size:12px;line-height:18px;color:#64748B;">© ${new Date().getFullYear()} © 2026 Automora · Secure workflow automation for modern teams</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;

  const gmailResult = await sendGmailEmail(authHeader, {
    to: inviteeEmail,
    subject,
    body: text,
    bodyHtml: html,
  });

  if (gmailResult.status !== 200) {
    throw new Error(String(gmailResult?.body?.message || "Admin Gmail is not connected"));
  }
};


const enforceInviteRateLimit = (userId) => {
  const now = Date.now();
  const current = inviteRateLimitMap.get(userId) || [];
  const kept = current.filter((ts) => now - ts < INVITE_RATE_LIMIT_WINDOW_MS);
  if (kept.length >= INVITE_RATE_LIMIT_MAX) return false;
  kept.push(now);
  inviteRateLimitMap.set(userId, kept);
  return true;
};

const requireManageUsersPermission = (user) => {
  if (!user) return { status: 401, body: { message: "unauthorized" } };
  if (!canManageUsers(user.role)) return { status: 403, body: { message: "forbidden" } };
  return null;
};

const toManagedUserRow = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  invitedDate: user.invited_at || user.created_at,
  isDisabled: Boolean(user.is_disabled),
  invitationState: "Active",
});

const toPendingInviteRow = (invite) => ({
  id: invite.id,
  name: invite.invited_name,
  email: invite.invited_email,
  role: invite.role,
  status: invite.is_expired ? "Expired" : "Pending",
  invitedDate: invite.created_at,
  isDisabled: false,
  invitationState: invite.is_expired ? "Expired" : "Pending",
});

export const listUsersForAdmin = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  const permissionError = requireManageUsersPermission(user);
  if (permissionError) return permissionError;

  const workspaceId = String(user.workspace_id || user.id);

  const [workspaceUsers, pendingInvites] = await Promise.all([
    listUsersByWorkspaceId(workspaceId),
    listPendingInvites(user.id),
  ]);

  return {
    status: 200,
    body: {
      users: [
        ...pendingInvites.map(toPendingInviteRow),
        ...workspaceUsers.map(toManagedUserRow),
      ],
    },
  };
};

export const inviteUserForAdmin = async (authHeader, payload) => {
  const user = await getAuthorizedUser(authHeader);
  const permissionError = requireManageUsersPermission(user);
  if (permissionError) return permissionError;

  if (!enforceInviteRateLimit(user.id)) {
    return { status: 429, body: { message: "invite rate limit exceeded. please try again later" } };
  }

  const name = String(payload?.name || "").trim();
  const email = normalizeEmail(payload?.email);
  const role = normalizeRole(payload?.role);

  if (!name || !email || !role || role === APP_ROLES.ADMIN) {
    return { status: 400, body: { message: "name, email and valid role are required" } };
  }

  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    return { status: 409, body: { message: "user with this email already exists" } };
  }

  const rawToken = createToken();
  const hashedToken = tokenHash(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  const savedInvite = await upsertInvite({
    id: createUserId(),
    inviterUserId: user.id,
    invitedName: name,
    invitedEmail: email,
    role,
    tokenHash: hashedToken,
    expiresAt,
  });

  const activationLink = `${APP_BASE_URL}/activate-account?token=${rawToken}`;

  try {
    await sendInviteMessage({
      authHeader,
      inviteeEmail: email,
      inviterName: user.name,
      inviteeName: name,
      role,
      activationLink,
    });
  } catch (error) {
    return { status: 502, body: { message: String(error?.message || "Unable to send invite via connected admin Gmail") } };
  }

  return {
    status: 201,
    body: {
      message: "invite sent",
      invite: {
        id: savedInvite.id,
        name,
        email,
        role,
        expiresAt,
      },
    },
  };
};

export const resendInviteForAdmin = async (authHeader, email) => {
  const user = await getAuthorizedUser(authHeader);
  const permissionError = requireManageUsersPermission(user);
  if (permissionError) return permissionError;

  if (!enforceInviteRateLimit(user.id)) {
    return { status: 429, body: { message: "invite rate limit exceeded. please try again later" } };
  }

  const normalizedEmail = normalizeEmail(email);
  const invite = await getInviteByEmail({ inviterUserId: user.id, invitedEmail: normalizedEmail });
  if (!invite) return { status: 404, body: { message: "pending invite not found" } };

  const rawToken = createToken();
  const hashedToken = tokenHash(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  await upsertInvite({
    id: invite.id,
    inviterUserId: user.id,
    invitedName: invite.invited_name,
    invitedEmail: normalizedEmail,
    role: invite.role,
    tokenHash: hashedToken,
    expiresAt,
  });

  const activationLink = `${APP_BASE_URL}/activate-account?token=${rawToken}`;

  try {
    await sendInviteMessage({
      authHeader,
      inviteeEmail: normalizedEmail,
      inviterName: user.name,
      inviteeName: invite.invited_name,
      role: invite.role,
      activationLink,
    });
  } catch (error) {
    return { status: 502, body: { message: String(error?.message || "Unable to resend invite via connected admin Gmail") } };
  }

  return { status: 200, body: { message: "invite resent" } };
};

export const changeManagedUserRole = async (authHeader, userId, payload) => {
  const user = await getAuthorizedUser(authHeader);
  const permissionError = requireManageUsersPermission(user);
  if (permissionError) return permissionError;

  const nextRole = normalizeRole(payload?.role);
  if (!nextRole || nextRole === APP_ROLES.ADMIN) {
    return { status: 400, body: { message: "invalid role" } };
  }

  const target = await getUserById(userId);
  if (!target || target.invited_by !== user.id) {
    return { status: 404, body: { message: "user not found" } };
  }

  await updateUserRoleById({ userId, role: nextRole });
  return { status: 200, body: { message: "role updated" } };
};

export const disableManagedUser = async (authHeader, userId, payload) => {
  const user = await getAuthorizedUser(authHeader);
  const permissionError = requireManageUsersPermission(user);
  if (permissionError) return permissionError;

  const disabled = Boolean(payload?.disabled);
  const target = await getUserById(userId);
  if (!target || target.invited_by !== user.id) {
    return { status: 404, body: { message: "user not found" } };
  }

  await disableUserById({ userId, disabled });
  return { status: 200, body: { message: disabled ? "user disabled" : "user enabled" } };
};


export const deleteManagedUser = async (authHeader, userId) => {
  const user = await getAuthorizedUser(authHeader);
  const permissionError = requireManageUsersPermission(user);
  if (permissionError) return permissionError;

  const target = await getUserById(userId);
  if (!target) return { status: 404, body: { message: "user not found" } };

  const sameWorkspace = String(target.workspace_id || target.id) === String(user.workspace_id || user.id);
  if (!sameWorkspace || String(target.id) === String(user.id)) {
    return { status: 403, body: { message: "forbidden" } };
  }

  await deleteUserAccountById(target.id);
  return { status: 200, body: { message: "user deleted" } };
};

export const validateInviteActivationToken = async (token) => {
  const invite = await getInviteByTokenHash(tokenHash(token));
  if (!invite) return { status: 404, body: { message: "invalid invite token" } };
  if (invite.used_at || invite.disabled_at) return { status: 410, body: { message: "invite link has already been used" } };
  if (invite.is_expired) return { status: 410, body: { message: "invite link expired" } };

  return {
    status: 200,
    body: {
      invite: {
        email: invite.invited_email,
        name: invite.invited_name,
        role: invite.role,
        expiresAt: invite.expires_at,
      },
    },
  };
};

export const activateInvitedUser = async ({ token, password, confirmPassword }) => {
  const rawToken = String(token || "").trim();
  if (!rawToken) return { status: 400, body: { message: "token is required" } };

  if (!password || String(password).length < 8) {
    return { status: 400, body: { message: "password must be at least 8 characters" } };
  }

  if (String(password) !== String(confirmPassword)) {
    return { status: 400, body: { message: "password and confirm password must match" } };
  }

  const invite = await getInviteByTokenHash(tokenHash(rawToken));
  if (!invite) return { status: 404, body: { message: "invalid invite token" } };
  if (invite.used_at || invite.disabled_at) return { status: 410, body: { message: "invite link has already been used" } };
  if (invite.is_expired) return { status: 410, body: { message: "invite link expired" } };

  const existing = await getUserByEmail(invite.invited_email);
  if (existing) return { status: 409, body: { message: "account already activated" } };

  const now = new Date();
  const inviter = await getUserById(invite.inviter_user_id);
  const created = await createInvitedUser({
    id: createUserId(),
    name: invite.invited_name,
    email: invite.invited_email,
    passwordHash: hashPassword(password),
    role: invite.role,
    workspaceId: String(inviter?.workspace_id || inviter?.id || invite.inviter_user_id),
    invitedBy: invite.inviter_user_id,
    invitedAt: invite.created_at || now,
    invitationAcceptedAt: now,
  });

  const inviterCompanyName = String(inviter?.organization_name || "").trim();
  if (inviterCompanyName) {
    await upsertOrganizationNameByUserId({ userId: created.id, organizationName: inviterCompanyName });
  }

  await markInviteUsed(invite.id);

  const sessionToken = createToken();
  await createSession({ token: sessionToken, userId: created.id });

  return {
    status: 200,
    body: {
      message: "account activated",
      token: sessionToken,
      onboardingRequired: false,
      redirectTo: "/dashboard",
    },
  };
};

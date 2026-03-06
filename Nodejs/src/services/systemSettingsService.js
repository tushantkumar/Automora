import { SMTP_FROM } from "../config/constants.js";
import { getUserBySessionToken, upsertOrganizationNameByUserId } from "../db/authRepository.js";
import { getSystemSettingsByUserId, upsertSystemSettingsByUserId } from "../db/systemSettingsRepository.js";

const readBearerToken = (authHeader) =>
  String(authHeader || "").startsWith("Bearer ") ? String(authHeader).slice(7) : "";

const getAuthorizedUser = async (authHeader) => {
  const token = readBearerToken(authHeader);
  if (!token) return null;
  const user = await getUserBySessionToken(token);
  if (!user) return null;
  return { ...user, actor_user_id: user.id, id: user.workspace_id || user.id };
};

const toResponseSettings = ({ user }) => ({
  smtpFrom: SMTP_FROM,
  companyName: String(user?.organization_name || "").trim(),
});

export const getSystemSettingsForUser = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  await getSystemSettingsByUserId(user.id);
  return { status: 200, body: { settings: toResponseSettings({ user }) } };
};

export const updateSystemSettingsForUser = async (authHeader, payload) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const companyName = String(payload?.companyName || "").trim();

  await upsertSystemSettingsByUserId({
    userId: user.id,
    smtpFrom: null,
  });

  await upsertOrganizationNameByUserId({ userId: user.id, organizationName: companyName });

  return {
    status: 200,
    body: {
      message: "system settings saved",
      settings: toResponseSettings({ user: { ...user, organization_name: companyName } }),
    },
  };
};

export const getEffectiveSystemSettingsByUserId = async (userId) => {
  await getSystemSettingsByUserId(userId);
  return toResponseSettings({ user: null });
};

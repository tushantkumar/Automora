import { SMTP_FROM } from "../config/constants.js";
import { getUserBySessionToken, upsertOrganizationNameByUserId } from "../db/authRepository.js";
import { getSystemSettingsByUserId, upsertSystemSettingsByUserId } from "../db/systemSettingsRepository.js";

export const DEFAULT_SUPPORT_HIGHLIGHT_TEXT = "support@automora.local";

const readBearerToken = (authHeader) =>
  String(authHeader || "").startsWith("Bearer ") ? String(authHeader).slice(7) : "";

const getAuthorizedUser = async (authHeader) => {
  const token = readBearerToken(authHeader);
  if (!token) return null;
  return getUserBySessionToken(token);
};

const normalizeSupportHighlightText = (value) => String(value || "").trim();

const toResponseSettings = ({ settingsRow, user }) => ({
  smtpFrom: SMTP_FROM,
  supportHighlightText: normalizeSupportHighlightText(settingsRow?.support_highlight_text) || DEFAULT_SUPPORT_HIGHLIGHT_TEXT,
  companyName: String(user?.organization_name || "").trim(),
});

export const getSystemSettingsForUser = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const settingsRow = await getSystemSettingsByUserId(user.id);
  return { status: 200, body: { settings: toResponseSettings({ settingsRow, user }) } };
};

export const updateSystemSettingsForUser = async (authHeader, payload) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const supportHighlightText = normalizeSupportHighlightText(payload?.supportHighlightText);
  const companyName = String(payload?.companyName || "").trim();

  const saved = await upsertSystemSettingsByUserId({
    userId: user.id,
    smtpFrom: null,
    supportHighlightText,
  });

  await upsertOrganizationNameByUserId({ userId: user.id, organizationName: companyName });

  return {
    status: 200,
    body: {
      message: "system settings saved",
      settings: toResponseSettings({ settingsRow: saved, user: { ...user, organization_name: companyName } }),
    },
  };
};

export const getEffectiveSystemSettingsByUserId = async (userId) => {
  const settingsRow = await getSystemSettingsByUserId(userId);
  return toResponseSettings({ settingsRow, user: null });
};

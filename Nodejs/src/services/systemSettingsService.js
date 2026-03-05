import { SMTP_FROM } from "../config/constants.js";
import { getUserBySessionToken } from "../db/authRepository.js";
import { getSystemSettingsByUserId, upsertSystemSettingsByUserId } from "../db/systemSettingsRepository.js";

export const DEFAULT_SUPPORT_HIGHLIGHT_TEXT = "support@automora.local";

const readBearerToken = (authHeader) =>
  String(authHeader || "").startsWith("Bearer ") ? String(authHeader).slice(7) : "";

const getAuthorizedUser = async (authHeader) => {
  const token = readBearerToken(authHeader);
  if (!token) return null;
  return getUserBySessionToken(token);
};

const normalizeSmtpFrom = (value) => String(value || "").trim();
const normalizeSupportHighlightText = (value) => String(value || "").trim();

const toResponseSettings = (row) => ({
  smtpFrom: normalizeSmtpFrom(row?.smtp_from) || SMTP_FROM,
  supportHighlightText: normalizeSupportHighlightText(row?.support_highlight_text) || DEFAULT_SUPPORT_HIGHLIGHT_TEXT,
});

export const getSystemSettingsForUser = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const settings = await getSystemSettingsByUserId(user.id);
  return { status: 200, body: { settings: toResponseSettings(settings) } };
};

export const updateSystemSettingsForUser = async (authHeader, payload) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const smtpFrom = normalizeSmtpFrom(payload?.smtpFrom);
  const supportHighlightText = normalizeSupportHighlightText(payload?.supportHighlightText);

  const saved = await upsertSystemSettingsByUserId({
    userId: user.id,
    smtpFrom,
    supportHighlightText,
  });

  return { status: 200, body: { message: "system settings saved", settings: toResponseSettings(saved) } };
};

export const getEffectiveSystemSettingsByUserId = async (userId) => {
  const settings = await getSystemSettingsByUserId(userId);
  return toResponseSettings(settings);
};

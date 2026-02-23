import { getUserBySessionToken } from "../db/authRepository.js";
import {
  createMailTemplate,
  deleteMailTemplateById,
  listMailTemplatesByUserId,
  updateMailTemplateById,
} from "../db/mailTemplateRepository.js";
import { createUserId } from "../utils/auth.js";

const readBearerToken = (authHeader) =>
  String(authHeader || "").startsWith("Bearer ") ? String(authHeader).slice(7) : "";

const getAuthorizedUser = async (authHeader) => {
  const token = readBearerToken(authHeader);
  if (!token) return null;
  return getUserBySessionToken(token);
};

const normalizePayload = (payload) => ({
  name: String(payload?.name || "").trim(),
  subject: String(payload?.subject || "").trim(),
  body: String(payload?.body || "").trim(),
});

export const getMailTemplatesForUser = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const templates = await listMailTemplatesByUserId(user.id);
  return { status: 200, body: { templates } };
};

export const createMailTemplateForUser = async (authHeader, payload) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const data = normalizePayload(payload);
  if (!data.name || !data.subject || !data.body) {
    return { status: 400, body: { message: "name, subject and body are required" } };
  }

  const template = await createMailTemplate({
    id: createUserId(),
    userId: user.id,
    ...data,
  });

  return { status: 201, body: { message: "mail template created", template } };
};

export const updateMailTemplateForUser = async (authHeader, templateId, payload) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const data = normalizePayload(payload);
  if (!data.name || !data.subject || !data.body) {
    return { status: 400, body: { message: "name, subject and body are required" } };
  }

  const template = await updateMailTemplateById({
    templateId,
    userId: user.id,
    ...data,
  });

  if (!template) return { status: 404, body: { message: "mail template not found" } };

  return { status: 200, body: { message: "mail template updated", template } };
};

export const deleteMailTemplateForUser = async (authHeader, templateId) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const deleted = await deleteMailTemplateById({ templateId, userId: user.id });
  if (!deleted) return { status: 404, body: { message: "mail template not found" } };

  return { status: 200, body: { message: "mail template deleted" } };
};

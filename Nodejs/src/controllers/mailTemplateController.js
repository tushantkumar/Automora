import {
  createMailTemplateForUser,
  deleteMailTemplateForUser,
  getMailTemplatesForUser,
  updateMailTemplateForUser,
} from "../services/mailTemplateService.js";

export const getMailTemplatesHandler = async (req, res) => {
  const result = await getMailTemplatesForUser(req.headers.authorization);
  return res.status(result.status).json(result.body);
};

export const createMailTemplateHandler = async (req, res) => {
  const result = await createMailTemplateForUser(req.headers.authorization, req.body || {});
  return res.status(result.status).json(result.body);
};

export const updateMailTemplateHandler = async (req, res) => {
  const result = await updateMailTemplateForUser(req.headers.authorization, req.params.templateId, req.body || {});
  return res.status(result.status).json(result.body);
};

export const deleteMailTemplateHandler = async (req, res) => {
  const result = await deleteMailTemplateForUser(req.headers.authorization, req.params.templateId);
  return res.status(result.status).json(result.body);
};

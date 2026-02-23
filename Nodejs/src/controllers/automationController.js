import {
  createAutomationForUser,
  getAutomationBuilderMetadataForUser,
  listAutomationsForUser,
} from "../services/automationService.js";

export const getAutomationMetadataHandler = async (req, res) => {
  const result = await getAutomationBuilderMetadataForUser(req.headers.authorization);
  return res.status(result.status).json(result.body);
};

export const listAutomationsHandler = async (req, res) => {
  const result = await listAutomationsForUser(req.headers.authorization);
  return res.status(result.status).json(result.body);
};

export const createAutomationHandler = async (req, res) => {
  const result = await createAutomationForUser(req.headers.authorization, req.body || {});
  return res.status(result.status).json(result.body);
};

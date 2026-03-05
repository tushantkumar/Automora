import { getSystemSettingsForUser, updateSystemSettingsForUser } from "../services/systemSettingsService.js";

export const getSystemSettingsHandler = async (req, res) => {
  const result = await getSystemSettingsForUser(req.headers.authorization);
  return res.status(result.status).json(result.body);
};

export const updateSystemSettingsHandler = async (req, res) => {
  const result = await updateSystemSettingsForUser(req.headers.authorization, req.body || {});
  return res.status(result.status).json(result.body);
};

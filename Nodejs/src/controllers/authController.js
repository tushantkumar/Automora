import {
  deleteAccountWithOtp,
  getOnboardingDetails,
  login,
  me,
  requestAccountDeletionOtp,
  requestPasswordReset,
  resetPassword,
  saveOnboardingDetails,
  signup,
  verifyEmail,
} from "../services/authService.js";

export const signupHandler = async (req, res) => {
  const result = await signup(req.body || {});
  return res.status(result.status).json(result.body);
};

export const verifyEmailHandler = async (req, res) => {
  const result = await verifyEmail(req.query || {});
  return res.status(result.status).json(result.body);
};

export const forgotPasswordHandler = async (req, res) => {
  const result = await requestPasswordReset(req.body || {});
  return res.status(result.status).json(result.body);
};

export const resetPasswordHandler = async (req, res) => {
  const result = await resetPassword(req.body || {});
  return res.status(result.status).json(result.body);
};

export const saveOnboardingHandler = async (req, res) => {
  const result = await saveOnboardingDetails(req.headers.authorization, req.body || {});
  return res.status(result.status).json(result.body);
};

export const getOnboardingHandler = async (req, res) => {
  const result = await getOnboardingDetails(req.headers.authorization);
  return res.status(result.status).json(result.body);
};

export const loginHandler = async (req, res) => {
  const result = await login(req.body || {});
  return res.status(result.status).json(result.body);
};

export const meHandler = async (req, res) => {
  const result = await me(req.headers.authorization);
  return res.status(result.status).json(result.body);
};


export const requestDeleteAccountOtpHandler = async (req, res) => {
  const result = await requestAccountDeletionOtp(req.headers.authorization);
  return res.status(result.status).json(result.body);
};

export const deleteAccountWithOtpHandler = async (req, res) => {
  const result = await deleteAccountWithOtp(req.headers.authorization, req.body || {});
  return res.status(result.status).json(result.body);
};

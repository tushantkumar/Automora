import { getUserBySessionToken } from "../db/authRepository.js";

const readBearerToken = (authHeader) => {
  const value = String(authHeader || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
};

export const accountStatusGuard = async (req, res, next) => {
  const token = readBearerToken(req.headers?.authorization);
  if (!token) return next();

  try {
    const user = await getUserBySessionToken(token);
    if (user?.is_disabled) {
      return res.status(403).json({
        message: "account is deactivated. please contact your admin",
        code: "ACCOUNT_DEACTIVATED",
      });
    }
  } catch (error) {
    console.error("Account status guard failed", error);
  }

  return next();
};

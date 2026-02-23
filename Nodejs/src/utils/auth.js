import crypto from "node:crypto";

export const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

export const verifyPassword = (password, stored) => {
  const [salt, storedHash] = String(stored || "").split(":");
  if (!salt || !storedHash) return false;

  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
};

export const createToken = () => crypto.randomBytes(32).toString("hex");
export const createUserId = () => crypto.randomUUID();

export const APP_ROLES = {
  ADMIN: "Admin",
  VIEWER: "Viewer",
  EDITOR: "Editor",
  OWNER: "Owner",
};

const ROLE_SET = new Set(Object.values(APP_ROLES));

export const normalizeRole = (role) => {
  const value = String(role || "").trim();
  if (ROLE_SET.has(value)) return value;
  return null;
};

export const canManageUsers = (role) => normalizeRole(role) === APP_ROLES.ADMIN;

export const canDeleteResources = (role) => {
  const normalized = normalizeRole(role);
  return normalized === APP_ROLES.ADMIN || normalized === APP_ROLES.OWNER;
};

export const canModifyResources = (role) => {
  const normalized = normalizeRole(role);
  return normalized === APP_ROLES.ADMIN || normalized === APP_ROLES.OWNER || normalized === APP_ROLES.EDITOR;
};

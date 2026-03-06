export const APP_ROLES = {
  ADMIN: "Admin",
  VIEWER: "Viewer",
  EDITOR: "Editor",
  OWNER: "Owner",
  AUTHOR: "Author",
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

export const canCreateResources = (role) => {
  const normalized = normalizeRole(role);
  return normalized === APP_ROLES.ADMIN || normalized === APP_ROLES.OWNER || normalized === APP_ROLES.AUTHOR;
};

export const canUpdateResources = (role) => {
  const normalized = normalizeRole(role);
  return normalized === APP_ROLES.ADMIN || normalized === APP_ROLES.OWNER || normalized === APP_ROLES.EDITOR || normalized === APP_ROLES.AUTHOR;
};

export const canUploadResources = (role) => {
  const normalized = normalizeRole(role);
  return normalized === APP_ROLES.ADMIN || normalized === APP_ROLES.OWNER || normalized === APP_ROLES.AUTHOR;
};

export const canSendMail = (role) => {
  const normalized = normalizeRole(role);
  return normalized === APP_ROLES.ADMIN || normalized === APP_ROLES.OWNER || normalized === APP_ROLES.EDITOR || normalized === APP_ROLES.AUTHOR;
};

// Backward-compatible alias for existing call sites.
export const canModifyResources = canUpdateResources;

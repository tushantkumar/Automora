export type AppNotification = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
};

const STORAGE_KEY = "app_notifications";
const CHANGE_EVENT = "app-notifications:changed";
const LIMIT = 100;

const CRUD_MESSAGES: Record<string, string> = {
  "automation created": "New automation created successfully.",
  "automation updated": "Automation updated successfully.",
  "automation deleted": "Automation deleted successfully.",
  "automation status updated": "Automation status updated successfully.",
  "customer created": "New customer created successfully.",
  "customer updated": "Customer updated successfully.",
  "customer deleted": "Customer deleted successfully.",
  "invoice created": "New invoice created successfully.",
  "invoice updated": "Invoice updated successfully.",
  "invoice deleted": "Invoice deleted successfully.",
  "template created": "New mail template created successfully.",
  "template updated": "Mail template updated successfully.",
  "template deleted": "Mail template deleted successfully.",
  "system settings saved successfully.": "System settings saved successfully.",
};

const getStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const toSentenceCase = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "Application updated.";
  const normalized = trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatNotificationTitle = (title: string) => {
  const key = title.trim().toLowerCase();
  return CRUD_MESSAGES[key] || toSentenceCase(title);
};

export const getNotifications = (): AppNotification[] => {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]") as AppNotification[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const persistNotifications = (items: AppNotification[]) => {
  const storage = getStorage();
  if (!storage) return;

  storage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const addNotification = (title: string, description?: string) => {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return;

  const next: AppNotification = {
    id: createId(),
    title: formatNotificationTitle(normalizedTitle),
    description: description?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  persistNotifications([next, ...getNotifications()].slice(0, LIMIT));
};

export const clearNotifications = () => {
  persistNotifications([]);
};

export const subscribeNotifications = (callback: () => void) => {
  if (typeof window === "undefined") return () => {};

  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
};

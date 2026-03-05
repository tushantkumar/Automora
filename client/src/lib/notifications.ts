export type AppNotification = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
};

const STORAGE_KEY = "app_notifications";
const CHANGE_EVENT = "app-notifications:changed";
const LIMIT = 100;

const NOTIFICATION_TITLE_MAP: Record<string, string> = {
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
  "account deleted successfully.": "Account deleted successfully.",
  "customer upload failed": "Customer upload failed.",
  "delete failed": "Unable to delete automation.",
  "enter a valid 6-digit otp.": "Enter a valid 6-digit OTP.",
  "gmail connected successfully. emails will be available in inbox.": "Gmail connected successfully.",
  "invoice upload failed": "Invoice upload failed.",
  "name, client, contact and email are required": "Please fill all required customer fields.",
  "name, subject and body are required": "Please fill name, subject, and body.",
  "otp sent to your email.": "OTP sent to your email.",
  "please fill all organization details to continue.": "Please fill all organization details to continue.",
  "please fill industry and business description to continue.": "Please fill industry and business description to continue.",
  "please fill required invoice fields and line items": "Please fill all required invoice fields and line items.",
  "reply message cannot be empty.": "Reply message cannot be empty.",
  "reply sent successfully.": "Reply sent successfully.",
  "save failed": "Unable to save automation.",
  "select at least one automation to finish setup.": "Select at least one automation to finish setup.",
  "selected email has no valid sender address.": "Selected email has no valid sender address.",
  "system settings saved successfully.": "System settings saved successfully.",
  "toggle failed": "Unable to update automation status.",
  "unable to delete account.": "Unable to delete account.",
  "unable to delete customer": "Unable to delete customer.",
  "unable to delete invoice": "Unable to delete invoice.",
  "unable to delete template": "Unable to delete mail template.",
  "unable to disconnect integration.": "Unable to disconnect integration.",
  "unable to download customer report": "Unable to download customer report.",
  "unable to download customer template": "Unable to download customer template.",
  "unable to download invoice": "Unable to download invoice.",
  "unable to download invoices": "Unable to download invoices.",
  "unable to download template": "Unable to download template.",
  "unable to generate ai reply.": "Unable to generate AI reply.",
  "unable to load automation module": "Unable to load automation module.",
  "unable to load customers": "Unable to load customers.",
  "unable to load inbox emails.": "Unable to load inbox emails.",
  "unable to load invoices": "Unable to load invoices.",
  "unable to load profile details.": "Unable to load profile details.",
  "unable to load templates": "Unable to load mail templates.",
  "unable to reach auth server. please make sure it is running.": "Unable to reach auth server.",
  "unable to reach auth server. please try again.": "Unable to reach auth server.",
  "unable to save customer": "Unable to save customer.",
  "unable to save invoice": "Unable to save invoice.",
  "unable to save onboarding details.": "Unable to save onboarding details.",
  "unable to save system settings.": "Unable to save system settings.",
  "unable to save template": "Unable to save mail template.",
  "unable to send delete otp.": "Unable to send delete OTP.",
  "unable to send reply.": "Unable to send reply.",
  "unable to start gmail authorization.": "Unable to start Gmail authorization.",
  "unable to sync gmail emails.": "Unable to sync Gmail emails.",
  "you are not logged in": "You are not logged in.",
  "you are not logged in.": "You are not logged in.",
  "you are not logged in. please login again.": "You are not logged in. Please login again.",
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
  return NOTIFICATION_TITLE_MAP[key] || toSentenceCase(title);
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

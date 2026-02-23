import { getCustomerById } from "../db/customerRepository.js";

export const processInvoiceStatusChangeAutomations = async () => [];
export const runDueTomorrowOverdueReminderAutomation = async () => {};
export const runMonthlyOverdueReminderAutomation = async () => {};
export const runDailyOverdueReminderAutomation = async () => {};
export const runWeeklyOverdueReminderAutomation = async () => {};

export const resolveInvoiceCustomerForAutomation = async ({ userId, customerId }) => {
  if (!customerId) return null;
  return getCustomerById({ customerId, userId });
};

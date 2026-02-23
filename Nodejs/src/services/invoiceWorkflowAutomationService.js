import { listUsersForAutomation } from "../db/authRepository.js";
import { listInvoicesForAutomation } from "../db/invoiceRepository.js";
import { getCustomerById } from "../db/customerRepository.js";
import { runAutomations } from "./automation/executionEngine.js";

const tomorrowDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const runInvoiceBatch = async ({ subTriggerType, dueDate = null }) => {
  const users = await listUsersForAutomation();

  for (const user of users) {
    const invoices = await listInvoicesForAutomation({ userId: user.id, dueDate });

    for (const invoice of invoices) {
      const customer = await resolveInvoiceCustomerForAutomation({ userId: user.id, customerId: invoice.customer_id });

      await runAutomations({
        triggerType: "Invoice",
        subTriggerType,
        context: {
          invoice,
          customer,
          user,
        },
      });
    }
  }
};

export const processInvoiceStatusChangeAutomations = async ({ user, invoice, customer }) =>
  runAutomations({
    triggerType: "Invoice",
    subTriggerType: "On Change",
    context: {
      invoice,
      customer,
      user,
    },
  });

export const runDueTomorrowOverdueReminderAutomation = async () =>
  runInvoiceBatch({ subTriggerType: "Day Before Overdue", dueDate: tomorrowDateString() });

export const runMonthlyOverdueReminderAutomation = async () =>
  runInvoiceBatch({ subTriggerType: "Monthly" });

export const runDailyOverdueReminderAutomation = async () =>
  runInvoiceBatch({ subTriggerType: "Daily" });

export const runWeeklyOverdueReminderAutomation = async () =>
  runInvoiceBatch({ subTriggerType: "Weekly" });

export const resolveInvoiceCustomerForAutomation = async ({ userId, customerId }) => {
  if (!customerId) return null;
  return getCustomerById({ customerId, userId });
};

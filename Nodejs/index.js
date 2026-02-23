import app from "./src/app.js";
import cron from "./src/vendor/node-cron.js";
import { purgeExpiredUnverifiedUsers } from "./src/db/authRepository.js";
import { ensureDatabaseIndexes, initDatabase } from "./src/db/postgres.js";
import { PORT } from "./src/config/constants.js";
import {
  runDailyOverdueReminderAutomation,
  runDueTomorrowOverdueReminderAutomation,
  runMonthlyOverdueReminderAutomation,
  runWeeklyOverdueReminderAutomation,
} from "./src/services/invoiceWorkflowAutomationService.js";

const USER_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const runScheduledInvoiceAutomations = async () => {
  await runDueTomorrowOverdueReminderAutomation();
  await runDailyOverdueReminderAutomation();
};

const start = async () => {
  await initDatabase();
  await ensureDatabaseIndexes();
  await purgeExpiredUnverifiedUsers();

  setInterval(async () => {
    try {
      await purgeExpiredUnverifiedUsers();
    } catch (error) {
      console.error("Failed to purge expired unverified users", error);
    }
  }, USER_CLEANUP_INTERVAL_MS);

  await runScheduledInvoiceAutomations();


  cron.schedule("0 6 * * *", async () => {
    try {
      await runDueTomorrowOverdueReminderAutomation();
      await runDailyOverdueReminderAutomation();
    } catch (error) {
      console.error("Failed to run daily invoice automations", error);
    }
  }, { timezone: "UTC" });

  cron.schedule("0 7 * * 1", async () => {
    try {
      await runWeeklyOverdueReminderAutomation();
    } catch (error) {
      console.error("Failed to run weekly invoice automations", error);
    }
  }, { timezone: "UTC" });

  cron.schedule("0 8 1 * *", async () => {
    try {
      await runMonthlyOverdueReminderAutomation();
    } catch (error) {
      console.error("Failed to run monthly invoice automations", error);
    }
  }, { timezone: "UTC" });

  app.listen(PORT, () => {
    console.log(`Auth API running on http://localhost:${PORT}`);
  });
};

start().catch((error) => {
  console.error("Failed to start auth API", error);
  process.exit(1);
});

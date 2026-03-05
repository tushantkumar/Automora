import { Router } from "express";
import { getSystemSettingsHandler, updateSystemSettingsHandler } from "../controllers/systemSettingsController.js";

const systemSettingsRouter = Router();

systemSettingsRouter.get("/system-settings", getSystemSettingsHandler);
systemSettingsRouter.put("/system-settings", updateSystemSettingsHandler);

export default systemSettingsRouter;

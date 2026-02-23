import { Router } from "express";
import {
  createAutomationHandler,
  getAutomationMetadataHandler,
  listAutomationsHandler,
  toggleAutomationHandler,
} from "../controllers/automationController.js";

const automationRouter = Router();

automationRouter.get("/automations/metadata", getAutomationMetadataHandler);
automationRouter.get("/automations", listAutomationsHandler);
automationRouter.post("/automations", createAutomationHandler);
automationRouter.patch("/automations/:automationId/toggle", toggleAutomationHandler);

export default automationRouter;

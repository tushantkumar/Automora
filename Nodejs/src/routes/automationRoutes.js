import { Router } from "express";
import {
  createAutomationHandler,
  deleteAutomationHandler,
  getAutomationMetadataHandler,
  listAutomationsHandler,
  toggleAutomationHandler,
  updateAutomationHandler,
} from "../controllers/automationController.js";

const automationRouter = Router();

automationRouter.get("/automations/metadata", getAutomationMetadataHandler);
automationRouter.get("/automations", listAutomationsHandler);
automationRouter.post("/automations", createAutomationHandler);
automationRouter.put("/automations/:automationId", updateAutomationHandler);
automationRouter.delete("/automations/:automationId", deleteAutomationHandler);
automationRouter.patch("/automations/:automationId/toggle", toggleAutomationHandler);

export default automationRouter;

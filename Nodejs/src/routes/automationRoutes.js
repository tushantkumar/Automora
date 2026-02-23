import { Router } from "express";
import {
  createAutomationHandler,
  getAutomationMetadataHandler,
  listAutomationsHandler,
} from "../controllers/automationController.js";

const automationRouter = Router();

automationRouter.get("/automations/metadata", getAutomationMetadataHandler);
automationRouter.get("/automations", listAutomationsHandler);
automationRouter.post("/automations", createAutomationHandler);

export default automationRouter;

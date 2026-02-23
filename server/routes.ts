import type { Express } from "express";
import { type Server } from "http";
import { AutomationController } from "./modules/automation/automation.controller";
import { AutomationRepository } from "./modules/automation/automation.repository";
import { AutomationService } from "./modules/automation/automation.service";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  const repository = new AutomationRepository();
  const service = new AutomationService(repository);
  const controller = new AutomationController(service);

  try {
    await service.initialize();
  } catch (error) {
    console.error("Automation module database initialization failed", error);
  }

  app.get("/api/automations/metadata", controller.getMetadata);
  app.get("/api/automations", controller.listAutomations);
  app.post("/api/automations", controller.createAutomation);

  return httpServer;
}

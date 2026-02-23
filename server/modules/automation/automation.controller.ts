import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AutomationService } from "./automation.service";
import { createAutomationSchema } from "./automation.validation";
import { actionOptions, conditionLogicOptions, conditionOperators, triggerOptions } from "./automation.types";

export class AutomationController {
  constructor(private readonly service: AutomationService) {}

  getMetadata = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const fields = this.service.getConditionFields();
      const mailTemplates = await this.service.getMailTemplates();

      res.json({
        triggers: triggerOptions,
        operators: conditionOperators,
        conditionLogic: conditionLogicOptions,
        actions: actionOptions,
        fields,
        mailTemplates,
      });
    } catch (error) {
      next(error);
    }
  };

  createAutomation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = createAutomationSchema.parse(req.body);
      const automation = await this.service.createAutomation(payload);
      res.status(201).json({ automation });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation failed",
          errors: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        });
      }

      return next(error);
    }
  };

  listAutomations = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const automations = await this.service.listAutomations();
      res.json({ automations });
    } catch (error) {
      next(error);
    }
  };
}

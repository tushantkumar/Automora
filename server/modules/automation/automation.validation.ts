import { z } from "zod";
import { actionOptions, conditionLogicOptions, conditionOperators, triggerOptions } from "./automation.types";

const conditionSchema = z.object({
  entity: z.enum(["customer", "invoice"]),
  field: z.string().min(1),
  operator: z.enum(conditionOperators),
  value: z.union([z.string().min(1), z.number()]),
});

export const createAutomationSchema = z
  .object({
    name: z.string().min(1, "Automation name is required"),
    trigger: z.enum(triggerOptions),
    conditionLogic: z.enum(conditionLogicOptions),
    conditions: z.array(conditionSchema).min(1, "At least one condition is required"),
    action: z.enum(actionOptions),
    subAction: z.enum(["Upsert CRM", "Upsert Invoice"]).optional(),
    mailTemplateId: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const requiresMailTemplate = ["Send Mail", "AI Generate (Auto Reply)", "AI Generate (Draft)"].includes(value.action);

    if (requiresMailTemplate && !value.mailTemplateId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mailTemplateId"],
        message: "Mail template selection is required for this action",
      });
    }

    if (value.action === "CRM" && value.subAction !== "Upsert CRM") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subAction"],
        message: "CRM action must use Upsert CRM sub-action",
      });
    }

    if (value.action === "Invoice" && value.subAction !== "Upsert Invoice") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subAction"],
        message: "Invoice action must use Upsert Invoice sub-action",
      });
    }
  });

export type CreateAutomationDTO = z.infer<typeof createAutomationSchema>;

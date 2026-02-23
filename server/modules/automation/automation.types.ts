export const triggerOptions = ["Email Received", "Customer", "Invoice"] as const;
export const actionOptions = ["Send Mail", "AI Generate (Auto Reply)", "AI Generate (Draft)", "CRM", "Invoice"] as const;
export const conditionOperators = ["equals", "not_equals", "contains", "greater_than", "less_than"] as const;
export const conditionLogicOptions = ["AND", "OR"] as const;

export type TriggerOption = (typeof triggerOptions)[number];
export type ActionOption = (typeof actionOptions)[number];
export type ConditionOperator = (typeof conditionOperators)[number];
export type ConditionLogic = (typeof conditionLogicOptions)[number];

export type EntityField = {
  key: string;
  label: string;
  dataType: "string" | "number" | "date";
  source: "customer" | "invoice";
};

export type AutomationCondition = {
  entity: "customer" | "invoice";
  field: string;
  operator: ConditionOperator;
  value: string | number;
};

export type CreateAutomationInput = {
  name: string;
  trigger: TriggerOption;
  conditionLogic: ConditionLogic;
  conditions: AutomationCondition[];
  action: ActionOption;
  subAction?: "Upsert CRM" | "Upsert Invoice";
  mailTemplateId?: string;
};

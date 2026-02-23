import { getUserBySessionToken } from "../db/authRepository.js";
import { createUserId } from "../utils/auth.js";
import {
  createAutomation,
  getAutomationByName,
  getAutomationEntityFields,
  listAutomationsByUserId,
  setAutomationActiveState,
} from "../db/automationRepository.js";
import { listMailTemplatesByUserId } from "../db/mailTemplateRepository.js";

const readBearerToken = (authHeader) =>
  String(authHeader || "").startsWith("Bearer ") ? String(authHeader).slice(7) : "";

const getAuthorizedUser = async (authHeader) => {
  const token = readBearerToken(authHeader);
  if (!token) return null;
  return getUserBySessionToken(token);
};

const ALLOWED_TRIGGERS = ["Email Received", "Customer", "Invoice"];
const ALLOWED_SUB_TRIGGERS = ["On Change", "Daily", "Weekly", "Monthly", "Day Before Overdue"];
const ALLOWED_ACTIONS = ["Send Mail", "AI Generate (Auto Reply)", "AI Generate (Draft)", "CRM", "Invoice"];
const ALLOWED_OPERATORS = [
  "equals",
  "not equals",
  "contains",
  "starts with",
  "ends with",
  "greater than",
  "less than",
  "greater than or equal",
  "less than or equal",
  "between",
  "is null",
  "is not null",
];

const STRING_OPERATORS = ["equals", "not equals", "contains", "starts with", "ends with", "is null", "is not null"];
const NUMBER_OPERATORS = ["equals", "not equals", "greater than", "less than", "greater than or equal", "less than or equal", "between", "is null", "is not null"];
const DATE_OPERATORS = ["equals", "not equals", "greater than", "less than", "greater than or equal", "less than or equal", "between", "is null", "is not null"];

const allowedOpsByType = {
  string: STRING_OPERATORS,
  number: NUMBER_OPERATORS,
  date: DATE_OPERATORS,
};

const normalizeConditionValue = (operator, value) => {
  if (["is null", "is not null"].includes(operator)) return null;
  if (operator === "between") {
    if (!Array.isArray(value) || value.length !== 2) return undefined;
    return value;
  }
  if (typeof value === "string") return value.trim();
  return value;
};

const validateConditions = (conditions, fieldsMap) => {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return "At least one condition is required";
  }

  for (const condition of conditions) {
    const entity = String(condition?.entity || "").toLowerCase();
    const field = String(condition?.field || "");
    const operator = String(condition?.operator || "").toLowerCase();

    if (!entity || !field || !operator) return "Each condition requires entity, field and operator";
    if (!ALLOWED_OPERATORS.includes(operator)) return `Unsupported operator: ${operator}`;

    const fieldDef = fieldsMap.get(`${entity}.${field}`);
    if (!fieldDef) return `Field ${field} does not exist in ${entity}`;

    const allowed = allowedOpsByType[fieldDef.dataType] || STRING_OPERATORS;
    if (!allowed.includes(operator)) return `Operator ${operator} is not valid for ${fieldDef.dataType} field ${field}`;

    const normalizedValue = normalizeConditionValue(operator, condition.value);
    if (normalizedValue === undefined || (typeof normalizedValue === "string" && !normalizedValue)) {
      return `Condition value is invalid for ${field}`;
    }
  }

  return null;
};

export const getAutomationBuilderMetadataForUser = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const [fields, templates] = await Promise.all([getAutomationEntityFields(), listMailTemplatesByUserId(user.id)]);

  return {
    status: 200,
    body: {
      triggers: ALLOWED_TRIGGERS,
      invoiceSubTriggers: ALLOWED_SUB_TRIGGERS,
      actions: ALLOWED_ACTIONS,
      operators: ALLOWED_OPERATORS,
      conditionLogic: ["AND", "OR"],
      fields,
      templates,
    },
  };
};

export const listAutomationsForUser = async (authHeader, query = {}) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 50);

  const { rows, total } = await listAutomationsByUserId({
    userId: user.id,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return {
    status: 200,
    body: {
      automations: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    },
  };
};

export const toggleAutomationForUser = async (authHeader, automationId, payload = {}) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const isActive = Boolean(payload?.isActive);
  const automation = await setAutomationActiveState({
    automationId,
    userId: user.id,
    isActive,
  });

  if (!automation) return { status: 404, body: { message: "automation not found" } };

  return { status: 200, body: { message: "automation updated", automation } };
};

export const createAutomationForUser = async (authHeader, payload) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const name = String(payload?.name || "").trim();
  const triggerType = String(payload?.trigger || "").trim();
  const subTrigger = payload?.subTrigger ? String(payload.subTrigger).trim() : null;
  const conditionLogic = String(payload?.conditionLogic || "AND").trim().toUpperCase();
  const actionType = String(payload?.action || "").trim();
  const actionSubType = payload?.subAction ? String(payload.subAction).trim() : null;
  const mailTemplateId = payload?.mailTemplateId ? String(payload.mailTemplateId).trim() : null;
  const conditions = Array.isArray(payload?.conditions) ? payload.conditions : [];
  const isActive = payload?.isActive !== false;

  if (!name || !ALLOWED_TRIGGERS.includes(triggerType) || !ALLOWED_ACTIONS.includes(actionType)) {
    return { status: 400, body: { message: "name, trigger and action are required" } };
  }

  const duplicate = await getAutomationByName({ userId: user.id, name });
  if (duplicate) {
    return { status: 409, body: { message: "automation name already exists" } };
  }

  if (triggerType === "Invoice") {
    if (!subTrigger || !ALLOWED_SUB_TRIGGERS.includes(subTrigger)) {
      return { status: 400, body: { message: "Invoice trigger requires a valid sub-trigger" } };
    }
  }

  if (triggerType !== "Invoice" && subTrigger) {
    return { status: 400, body: { message: "Sub-trigger is only allowed when trigger is Invoice" } };
  }

  const metadata = await getAutomationEntityFields();
  const fieldsMap = new Map(metadata.map((item) => [`${item.entity}.${item.key}`, item]));

  const conditionValidationError = validateConditions(conditions, fieldsMap);
  if (conditionValidationError) return { status: 400, body: { message: conditionValidationError } };
  if (!["AND", "OR"].includes(conditionLogic)) return { status: 400, body: { message: "Condition logic must be AND or OR" } };

  if (["Send Mail", "AI Generate (Auto Reply)", "AI Generate (Draft)"].includes(actionType)) {
    if (!mailTemplateId) return { status: 400, body: { message: "Mail template is required for selected action" } };

    const templates = await listMailTemplatesByUserId(user.id);
    const exists = templates.some((template) => template.id === mailTemplateId);
    if (!exists) return { status: 400, body: { message: "Selected mail template does not exist" } };
  }

  if (actionType === "CRM" && actionSubType !== "Upsert CRM") {
    return { status: 400, body: { message: "CRM action requires Upsert CRM sub-action" } };
  }

  if (actionType === "Invoice" && actionSubType !== "Upsert Invoice") {
    return { status: 400, body: { message: "Invoice action requires Upsert Invoice sub-action" } };
  }

  if (!["CRM", "Invoice"].includes(actionType) && actionSubType) {
    return { status: 400, body: { message: "Sub-action is only allowed for CRM and Invoice actions" } };
  }

  const automation = await createAutomation({
    id: createUserId(),
    userId: user.id,
    name,
    triggerType,
    subTrigger,
    conditionLogic,
    conditions,
    actionType,
    actionSubType,
    mailTemplateId,
    isActive,
  });

  return { status: 201, body: { message: "automation created", automation } };
};

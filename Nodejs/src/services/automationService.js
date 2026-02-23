import { getUserBySessionToken } from "../db/authRepository.js";
import { createUserId } from "../utils/auth.js";
import {
  createAutomation,
  deleteAutomationById,
  getAutomationById,
  getAutomationByName,
  getAutomationEntityFields,
  listAutomationsByUserId,
  setAutomationActiveState,
  updateAutomationById,
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
const CUSTOMER_SUB_TRIGGERS = ["Created", "Updated", "Deleted", "Create", "Delete"];
const INVOICE_SUB_TRIGGERS = ["On Change", "Daily", "Weekly", "Monthly", "Day Before Overdue"];
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

const normalizeCustomerSubTrigger = (value) => {
  if (value === "Create") return "Created";
  if (value === "Delete") return "Deleted";
  return value;
};


const validateConditions = (conditions, fieldsMap) => {
  if (!Array.isArray(conditions)) {
    return "Conditions payload is invalid";
  }

  if (conditions.length === 0) {
    return null;
  }

  for (const condition of conditions) {
    const entity = String(condition?.entity || "").toLowerCase();
    const field = String(condition?.field || "");
    const operator = String(condition?.operator || "").toLowerCase();
    const joiner = String(condition?.joiner || "AND").toUpperCase();

    if (!entity || !field || !operator) return "Each condition requires entity, field and operator";
    if (!ALLOWED_OPERATORS.includes(operator)) return `Unsupported operator: ${operator}`;
    if (!["AND", "OR"].includes(joiner)) return "Condition joiner must be AND or OR";

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

const validateAndNormalizePayload = async ({ userId, payload, excludeAutomationId = null }) => {
  const name = String(payload?.name || "").trim();
  const triggerType = String(payload?.trigger || "").trim();
  const subTrigger = payload?.subTrigger ? String(payload.subTrigger).trim() : null;
  const conditionLogic = String(payload?.conditionLogic || "AND").trim().toUpperCase();
  const actionType = String(payload?.action || "").trim();
  const actionSubType = payload?.subAction ? String(payload.subAction).trim() : null;
  const mailTemplateId = payload?.mailTemplateId ? String(payload.mailTemplateId).trim() : null;
  const conditions = Array.isArray(payload?.conditions) ? payload.conditions : [];
  const normalizedConditions = triggerType === "Email Received" ? [] : conditions;
  const isActive = payload?.isActive !== false;

  if (!name || !ALLOWED_TRIGGERS.includes(triggerType) || !ALLOWED_ACTIONS.includes(actionType)) {
    return { error: "name, trigger and action are required" };
  }

  const duplicate = await getAutomationByName({ userId, name, excludeAutomationId });
  if (duplicate) return { error: "automation name already exists", status: 409 };

  let normalizedSubTrigger = subTrigger;

  if (triggerType === "Customer") {
    normalizedSubTrigger = normalizeCustomerSubTrigger(subTrigger);
    if (!normalizedSubTrigger || !CUSTOMER_SUB_TRIGGERS.includes(normalizedSubTrigger)) {
      return { error: "Customer trigger requires a valid sub-trigger" };
    }
  }

  if (triggerType === "Invoice" && (!subTrigger || !INVOICE_SUB_TRIGGERS.includes(subTrigger))) {
    return { error: "Invoice trigger requires a valid sub-trigger" };
  }

  if (triggerType === "Email Received" && subTrigger) {
    return { error: "Sub-trigger is not allowed for Email Received trigger" };
  }

  if (triggerType === "Customer" && ["Updated"].includes(normalizedSubTrigger || "") && normalizedConditions.length === 0) {
    return { error: "At least one condition is required for Customer Updated trigger" };
  }

  if (triggerType === "Invoice" && normalizedConditions.length === 0) {
    return { error: "At least one condition is required for Invoice triggers" };
  }

  const metadata = await getAutomationEntityFields();
  const fieldsMap = new Map(metadata.map((item) => [`${item.entity}.${item.key}`, item]));

  const conditionValidationError = validateConditions(normalizedConditions, fieldsMap);
  if (conditionValidationError) return { error: conditionValidationError };
  if (!["AND", "OR"].includes(conditionLogic)) return { error: "Condition logic must be AND or OR" };

  if (["Send Mail", "AI Generate (Auto Reply)", "AI Generate (Draft)"].includes(actionType)) {
    if (!mailTemplateId) return { error: "Mail template is required for selected action" };

    const templates = await listMailTemplatesByUserId(userId);
    const exists = templates.some((template) => template.id === mailTemplateId);
    if (!exists) return { error: "Selected mail template does not exist" };
  }

  if (actionType === "CRM" && actionSubType !== "Upsert CRM") {
    return { error: "CRM action requires Upsert CRM sub-action" };
  }

  if (actionType === "Invoice" && actionSubType !== "Upsert Invoice") {
    return { error: "Invoice action requires Upsert Invoice sub-action" };
  }

  if (!["CRM", "Invoice"].includes(actionType) && actionSubType) {
    return { error: "Sub-action is only allowed for CRM and Invoice actions" };
  }

  return {
    value: {
      name,
      triggerType,
      subTrigger: normalizedSubTrigger,
      conditionLogic,
      conditions: normalizedConditions.map((condition) => ({
        ...condition,
        joiner: String(condition?.joiner || "AND").toUpperCase(),
      })),
      actionType,
      actionSubType,
      mailTemplateId,
      isActive,
    },
  };
};

export const getAutomationBuilderMetadataForUser = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const [fields, templates] = await Promise.all([getAutomationEntityFields(), listMailTemplatesByUserId(user.id)]);

  return {
    status: 200,
    body: {
      triggers: ALLOWED_TRIGGERS,
      customerSubTriggers: CUSTOMER_SUB_TRIGGERS.filter((item) => !["Create", "Delete"].includes(item)),
      invoiceSubTriggers: INVOICE_SUB_TRIGGERS,
      actions: ALLOWED_ACTIONS,
      operators: ALLOWED_OPERATORS,
      conditionLogic: ["AND", "OR"],
      conditionJoiners: ["AND", "OR"],
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
  const search = String(query.search || "").trim();

  const { rows, total } = await listAutomationsByUserId({
    userId: user.id,
    search,
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

export const createAutomationForUser = async (authHeader, payload) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const parsed = await validateAndNormalizePayload({ userId: user.id, payload });
  if (parsed.error) return { status: parsed.status || 400, body: { message: parsed.error } };

  const automation = await createAutomation({
    id: createUserId(),
    userId: user.id,
    ...parsed.value,
  });

  return { status: 201, body: { message: "automation created", automation } };
};

export const updateAutomationForUser = async (authHeader, automationId, payload) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const existing = await getAutomationById({ userId: user.id, automationId });
  if (!existing) return { status: 404, body: { message: "automation not found" } };

  const parsed = await validateAndNormalizePayload({ userId: user.id, payload, excludeAutomationId: automationId });
  if (parsed.error) return { status: parsed.status || 400, body: { message: parsed.error } };

  const automation = await updateAutomationById({
    automationId,
    userId: user.id,
    ...parsed.value,
  });

  return { status: 200, body: { message: "automation updated", automation } };
};

export const deleteAutomationForUser = async (authHeader, automationId) => {
  const user = await getAuthorizedUser(authHeader);
  if (!user) return { status: 401, body: { message: "unauthorized" } };

  const deleted = await deleteAutomationById({ automationId, userId: user.id });
  if (!deleted) return { status: 404, body: { message: "automation not found" } };

  return { status: 200, body: { message: "automation deleted" } };
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

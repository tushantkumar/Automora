import { getAutomationEntityFields, listActiveAutomationsByTrigger } from "../../db/automationRepository.js";
import { evaluateConditions } from "./conditionEvaluator.js";
import { executeAutomationAction } from "./actionExecutor.js";

const buildFieldTypeMap = async () => {
  const fields = await getAutomationEntityFields();
  return new Map(fields.map((field) => [`${field.entity}.${field.key}`, field.dataType]));
};

export const runAutomations = async ({ triggerType, subTriggerType = null, context }) => {
  const [fieldTypeMap, automations] = await Promise.all([
    buildFieldTypeMap(),
    listActiveAutomationsByTrigger({ triggerType, subTrigger: subTriggerType }),
  ]);

  const results = [];

  for (const automation of automations) {
    const hasConditions = Array.isArray(automation.conditions) && automation.conditions.length > 0;
    const passed = hasConditions
      ? evaluateConditions({
          conditions: automation.conditions,
          logic: automation.condition_logic,
          fieldTypeMap,
          context,
        })
      : true;

    if (!passed) continue;

    try {
      const actionResult = await executeAutomationAction({ automation, context });
      results.push({
        automationId: automation.id,
        actionType: automation.action_type,
        result: actionResult,
      });
    } catch (error) {
      console.error("Automation action execution failed", {
        automationId: automation.id,
        error,
      });
      results.push({
        automationId: automation.id,
        actionType: automation.action_type,
        error: String(error?.message || error || "execution error"),
      });
    }
  }

  return results;
};

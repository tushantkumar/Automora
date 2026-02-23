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

  for (const automation of automations) {
    const passed = evaluateConditions({
      conditions: automation.conditions,
      logic: automation.condition_logic,
      fieldTypeMap,
      context,
    });

    if (!passed) continue;

    try {
      await executeAutomationAction({ automation, context });
    } catch (error) {
      console.error("Automation action execution failed", {
        automationId: automation.id,
        error,
      });
    }
  }
};

const getFactValue = (facts, fact, path) => {
  const base = facts?.[fact];
  if (!path) return base;

  const normalized = String(path || "").replace(/^\$\./, "");
  if (!normalized) return base;

  return normalized.split(".").reduce((acc, segment) => {
    if (acc == null) return undefined;
    return acc[segment];
  }, base);
};

const compare = (left, operator, right) => {
  switch (operator) {
    case "equal":
      return String(left) === String(right);
    case "notEqual":
      return String(left) !== String(right);
    case "contains":
      return String(left || "").toLowerCase().includes(String(right || "").toLowerCase());
    case "greaterThan":
      return Number(left) > Number(right);
    case "lessThan":
      return Number(left) < Number(right);
    default:
      return false;
  }
};

const evaluateCondition = (condition, facts) => {
  if (!condition || typeof condition !== "object") return false;

  if (Array.isArray(condition.all)) {
    return condition.all.every((item) => evaluateCondition(item, facts));
  }

  if (Array.isArray(condition.any)) {
    return condition.any.some((item) => evaluateCondition(item, facts));
  }

  const fact = String(condition.fact || "");
  const operator = String(condition.operator || "");
  const left = getFactValue(facts, fact, condition.path);
  return compare(left, operator, condition.value);
};

export class Engine {
  constructor() {
    this.rules = [];
  }

  addRule(rule) {
    this.rules.push(rule || {});
  }

  async run(facts = {}) {
    const events = [];

    for (const rule of this.rules) {
      const pass = evaluateCondition(rule.conditions, facts);
      if (!pass) continue;
      if (rule.event) events.push(rule.event);
    }

    return { events };
  }
}

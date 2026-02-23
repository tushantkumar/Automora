const asDate = (value) => {
  if (value == null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const asNumber = (value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalize = (value, type) => {
  if (type === "number") return asNumber(value);
  if (type === "date") return asDate(value);
  return String(value ?? "");
};

export const evaluateCondition = ({ operator, actual, expected, type }) => {
  const left = normalize(actual, type);

  if (operator === "is null") return left == null || left === "";
  if (operator === "is not null") return !(left == null || left === "");

  if (operator === "between") {
    if (!Array.isArray(expected) || expected.length !== 2) return false;
    const start = normalize(expected[0], type);
    const end = normalize(expected[1], type);
    if (start == null || end == null || left == null) return false;
    return left >= start && left <= end;
  }

  const right = normalize(expected, type);

  if (type === "string") {
    const l = String(left || "").toLowerCase();
    const r = String(right || "").toLowerCase();
    switch (operator) {
      case "equals": return l === r;
      case "not equals": return l !== r;
      case "contains": return l.includes(r);
      case "starts with": return l.startsWith(r);
      case "ends with": return l.endsWith(r);
      default: return false;
    }
  }

  switch (operator) {
    case "equals": return left === right;
    case "not equals": return left !== right;
    case "greater than": return left > right;
    case "less than": return left < right;
    case "greater than or equal": return left >= right;
    case "less than or equal": return left <= right;
    default: return false;
  }
};

export const evaluateConditions = ({ conditions, logic = "AND", fieldTypeMap, context }) => {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;

  const results = conditions.map((condition) => {
    const key = `${String(condition.entity || "").toLowerCase()}.${String(condition.field || "")}`;
    const type = fieldTypeMap.get(key) || "string";
    const actual = context?.[condition.entity]?.[condition.field];
    return evaluateCondition({ operator: condition.operator, actual, expected: condition.value, type });
  });

  return logic === "OR" ? results.some(Boolean) : results.every(Boolean);
};

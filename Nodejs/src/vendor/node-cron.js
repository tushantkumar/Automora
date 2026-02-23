const parseField = (value, min, max) => {
  const text = String(value || "*").trim();
  if (text === "*") return null;

  const tokens = text.split(",").map((token) => token.trim()).filter(Boolean);
  const values = new Set();

  tokens.forEach((token) => {
    if (/^\*\/\d+$/.test(token)) {
      const step = Number(token.split("/")[1]);
      if (!Number.isFinite(step) || step <= 0) return;
      for (let i = min; i <= max; i += step) values.add(i);
      return;
    }

    if (/^\d+-\d+$/.test(token)) {
      const [start, end] = token.split("-").map(Number);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      for (let i = Math.max(start, min); i <= Math.min(end, max); i += 1) values.add(i);
      return;
    }

    const parsed = Number(token);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) values.add(parsed);
  });

  return values;
};

const matchesField = (set, value) => set === null || set.has(value);

const parseExpression = (expression) => {
  const parts = String(expression || "").trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: ${expression}`);

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return {
    minute: parseField(minute, 0, 59),
    hour: parseField(hour, 0, 23),
    dayOfMonth: parseField(dayOfMonth, 1, 31),
    month: parseField(month, 1, 12),
    dayOfWeek: parseField(dayOfWeek, 0, 6),
  };
};

const getUtcDateParts = (date) => ({
  minute: date.getUTCMinutes(),
  hour: date.getUTCHours(),
  dayOfMonth: date.getUTCDate(),
  month: date.getUTCMonth() + 1,
  dayOfWeek: date.getUTCDay(),
});

export const schedule = (expression, task, _options = {}) => {
  const parsed = parseExpression(expression);

  const tick = async () => {
    const now = new Date();
    const parts = getUtcDateParts(now);

    if (
      matchesField(parsed.minute, parts.minute)
      && matchesField(parsed.hour, parts.hour)
      && matchesField(parsed.dayOfMonth, parts.dayOfMonth)
      && matchesField(parsed.month, parts.month)
      && matchesField(parsed.dayOfWeek, parts.dayOfWeek)
    ) {
      await task();
    }
  };

  const intervalId = setInterval(() => {
    void tick();
  }, 60 * 1000);

  return {
    stop: () => clearInterval(intervalId),
    destroy: () => clearInterval(intervalId),
  };
};

const cron = { schedule };
export default cron;

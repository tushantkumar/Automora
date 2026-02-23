import { OLLAMA_BASE_URL, OLLAMA_MODEL } from "../../config/constants.js";

const callOllama = async (prompt) => {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Ollama request failed");
  }

  const text = String(data?.response || "").trim();
  if (!text) throw new Error("Empty Ollama response");
  return text;
};

export const classifyIncomingEmail = async ({ body }) => {
  const prompt = `Classify this email into one of:\n- Invoice\n- Query\n- Support\n- Customer\n- Other\n\nReturn only one word.\n\nEmail:\n${String(body || "")}`;
  const result = await callOllama(prompt);
  const normalized = result.split(/\s+/)[0].trim();
  const allowed = new Set(["Invoice", "Query", "Support", "Customer", "Other"]);
  return allowed.has(normalized) ? normalized : "Other";
};

export const generateAutomationContent = async ({ incomingEmailBody, relevantData }) => {
  const prompt = `You are a professional business email assistant.\nRespond politely and professionally.\n\nIncoming Email:\n${String(incomingEmailBody || "")}\n\nRelevant Data:\n${JSON.stringify(relevantData || {}, null, 2)}\n\nGenerate helpful response.`;
  return callOllama(prompt);
};

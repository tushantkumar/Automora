import { OLLAMA_BASE_URL, OLLAMA_MODEL } from "../../config/constants.js";

const callOllama = async (prompt,options = {}) => {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options
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
  const prompt = `Do not think. Follow instructions exactly.

Return EXACTLY 3 words separated by ONE space.

Word1 = Invoice OR Query OR Support OR Customer
Word2 = invoicePresent OR noInvoice
Word3 = invoice number exactly as written in the email (keep # if present) OR null

Rules:
- Exactly 3 words
- Single line only
- No extra words
- No punctuation added
- No brackets
- No explanations
- Do NOT modify the invoice number

Examples:
Query invoicePresent #234561
Invoice invoicePresent inv-00023
Support noInvoice null

Email:
${String(body || "")}`;

  const result = await callOllama(prompt, {
    temperature: 0,
    top_p: 0.1,
    repeat_penalty: 1.1,
    num_predict: 20
  });


  const allowedCategories = new Set(["Invoice", "Query", "Support", "Customer"]);
  const allowedFlags = new Set(["invoicePresent", "noInvoice"]);

  const tokens = String(result || "")
    .trim()
    .replace(/\n/g, " ")
    .split(/\s+/);

  let category = null;
  let invoiceFlag = "noInvoice";
  let invoiceNumber = null;

  // 🔎 Extract safely instead of trusting index
  for (const token of tokens) {
    if (allowedCategories.has(token)) {
      category = token;
    } else if (allowedFlags.has(token)) {
      invoiceFlag = token;
    } else if (token !== "null") {
      invoiceNumber = token;
    }
  }

  // Final fallback protection
  if (!category) category = "Other";
  if (!invoiceNumber || invoiceNumber === "null") {
    invoiceNumber = null;
  }

  return {
    category,
    invoiceFlag,
    invoiceNumber
  };
};

export const generateAutomationContent = async ({ incomingEmailBody, relevantData }) => {
const prompt = `
You are a professional business email assistant.

Category: ${relevantData?.classification?.category}
InvoiceFlag: ${relevantData?.classification?.invoiceFlag}
InvoiceNumber: ${relevantData?.classification?.invoiceNumber}

Write a concise and professional email reply.

Rules:
- Use only the information provided.
- Do NOT invent invoice details.
- If Invoice + invoicePresent → acknowledge request and mention the invoice number exactly.
- If Invoice + noInvoice → ask for the invoice number politely.
- If Support → acknowledge issue and say team is reviewing.
- If Query → respond helpfully.
- If Customer → thank them and offer assistance.
- Plain text only.
- No HTML.
- No explanations.
- No Best Regards or Thanks
- No orginaztion at last

Return exactly in this format:

<Body: email message>

Incoming Email:
${String(incomingEmailBody || "")}`;

  return callOllama(prompt, {
    temperature: 0.2,
    top_p: 0.9,
    repeat_penalty: 1.1,
    num_predict: 300
  });
};
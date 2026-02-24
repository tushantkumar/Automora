export const PORT = process.env.PORT || 4000;
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5000";
export const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5000";
export const DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/autox";

export const SMTP_HOST = process.env.SMTP_HOST || "";
export const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
export const SMTP_USER = process.env.SMTP_USER || "";
export const SMTP_PASS = process.env.SMTP_PASS || "";
export const SMTP_FROM = process.env.SMTP_FROM || "no-reply@automora.local";


export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "420953888297-4pctoqv0sgvurv2dnop9st9ovrmhbr5i.apps.googleusercontent.com";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "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";
export const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/email-integrations/gmail/callback";


export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "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";
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";


export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

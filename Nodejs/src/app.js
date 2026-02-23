import express from "express";
import authRouter from "./routes/authRoutes.js";
import { corsMiddleware } from "./middleware/cors.js";
import customerRouter from "./routes/customerRoutes.js";
import invoiceRouter from "./routes/invoiceRoutes.js";
import emailIntegrationRouter from "./routes/emailIntegrationRoutes.js";
import mailTemplateRouter from "./routes/mailTemplateRoutes.js";
import automationRouter from "./routes/automationRoutes.js";

const app = express();

app.use(corsMiddleware);
app.use(express.json());
app.use(authRouter);
app.use(customerRouter);
app.use(invoiceRouter);
app.use(emailIntegrationRouter);
app.use(mailTemplateRouter);
app.use(automationRouter);

// centralized error handler
app.use((error, _req, res, _next) => {
  console.error("Unhandled API error", error);
  if (res.headersSent) return;
  res.status(500).json({ message: "internal server error" });
});

export default app;

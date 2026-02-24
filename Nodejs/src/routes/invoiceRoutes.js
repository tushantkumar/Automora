import { Router } from "express";
import {
  createInvoiceHandler,
  deleteInvoiceHandler,
  getInvoiceInsightsHandler,
  getInvoicesHandler,
  updateInvoiceHandler,
  downloadInvoicePdfHandler,
} from "../controllers/invoiceController.js";

const invoiceRouter = Router();

invoiceRouter.get("/invoices", getInvoicesHandler);
invoiceRouter.get("/invoices/insights", getInvoiceInsightsHandler);
invoiceRouter.get("/invoices/:invoiceId/download", downloadInvoicePdfHandler);
invoiceRouter.post("/invoices", createInvoiceHandler);
invoiceRouter.put("/invoices/:invoiceId", updateInvoiceHandler);
invoiceRouter.delete("/invoices/:invoiceId", deleteInvoiceHandler);

export default invoiceRouter;

import {
  createInvoiceForUser,
  deleteInvoiceForUser,
  getInvoiceInsightsForUser,
  getInvoicesForUser,
  updateInvoiceForUser,
} from "../services/invoiceService.js";

export const getInvoicesHandler = async (req, res) => {
  const result = await getInvoicesForUser(req.headers.authorization, req.query || {});
  return res.status(result.status).json(result.body);
};

export const getInvoiceInsightsHandler = async (req, res) => {
  const result = await getInvoiceInsightsForUser(req.headers.authorization);
  return res.status(result.status).json(result.body);
};

export const createInvoiceHandler = async (req, res) => {
  const result = await createInvoiceForUser(req.headers.authorization, req.body || {});
  return res.status(result.status).json(result.body);
};

export const updateInvoiceHandler = async (req, res) => {
  const result = await updateInvoiceForUser(req.headers.authorization, req.params.invoiceId, req.body || {});
  return res.status(result.status).json(result.body);
};

export const deleteInvoiceHandler = async (req, res) => {
  const result = await deleteInvoiceForUser(req.headers.authorization, req.params.invoiceId);
  return res.status(result.status).json(result.body);
};

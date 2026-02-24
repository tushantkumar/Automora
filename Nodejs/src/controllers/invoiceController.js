import {
  createInvoiceForUser,
  deleteInvoiceForUser,
  getInvoiceInsightsForUser,
  getInvoicesForUser,
  updateInvoiceForUser,
  getInvoicePdfForUser,
  exportInvoicesExcelForUser,
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

export const downloadInvoicesExcelHandler = async (req, res) => {
  const result = await exportInvoicesExcelForUser(req.headers.authorization, req.query || {});
  if (result.status !== 200) {
    return res.status(result.status).json(result.body);
  }

  res.setHeader("Content-Type", "application/vnd.ms-excel");
  res.setHeader("Content-Disposition", `attachment; filename="${result.body.fileName}"`);
  return res.status(200).send(result.body.buffer);
};

export const downloadInvoicePdfHandler = async (req, res) => {
  const result = await getInvoicePdfForUser(req.headers.authorization, req.params.invoiceId);
  if (result.status !== 200) {
    return res.status(result.status).json(result.body);
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${result.body.fileName}"`);
  return res.status(200).send(result.body.buffer);
};

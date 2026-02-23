import {
  createCustomerForUser,
  deleteCustomerForUser,
  getCustomersForUser,
  updateCustomerForUser,
} from "../services/customerService.js";

export const getCustomersHandler = async (req, res) => {
  const result = await getCustomersForUser(req.headers.authorization);
  return res.status(result.status).json(result.body);
};

export const createCustomerHandler = async (req, res) => {
  const result = await createCustomerForUser(req.headers.authorization, req.body || {});
  return res.status(result.status).json(result.body);
};

export const updateCustomerHandler = async (req, res) => {
  const result = await updateCustomerForUser(req.headers.authorization, req.params.customerId, req.body || {});
  return res.status(result.status).json(result.body);
};

export const deleteCustomerHandler = async (req, res) => {
  const result = await deleteCustomerForUser(req.headers.authorization, req.params.customerId);
  return res.status(result.status).json(result.body);
};

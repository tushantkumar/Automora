import { Router } from "express";
import {
  createCustomerHandler,
  deleteCustomerHandler,
  getCustomersHandler,
  updateCustomerHandler,
  downloadCustomerInvoicePdfHandler,
  downloadCustomerInvoicesExcelHandler,
} from "../controllers/customerController.js";

const customerRouter = Router();

customerRouter.get("/customers", getCustomersHandler);
customerRouter.get("/customers/download/excel", downloadCustomerInvoicesExcelHandler);
customerRouter.get("/customers/:customerId/download", downloadCustomerInvoicePdfHandler);
customerRouter.post("/customers", createCustomerHandler);
customerRouter.put("/customers/:customerId", updateCustomerHandler);
customerRouter.delete("/customers/:customerId", deleteCustomerHandler);

export default customerRouter;

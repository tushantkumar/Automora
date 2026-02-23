import { Router } from "express";
import {
  createCustomerHandler,
  deleteCustomerHandler,
  getCustomersHandler,
  updateCustomerHandler,
} from "../controllers/customerController.js";

const customerRouter = Router();

customerRouter.get("/customers", getCustomersHandler);
customerRouter.post("/customers", createCustomerHandler);
customerRouter.put("/customers/:customerId", updateCustomerHandler);
customerRouter.delete("/customers/:customerId", deleteCustomerHandler);

export default customerRouter;

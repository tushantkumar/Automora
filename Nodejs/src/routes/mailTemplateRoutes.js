import { Router } from "express";
import {
  createMailTemplateHandler,
  deleteMailTemplateHandler,
  getMailTemplatesHandler,
  updateMailTemplateHandler,
} from "../controllers/mailTemplateController.js";

const mailTemplateRouter = Router();

mailTemplateRouter.get("/mail-templates", getMailTemplatesHandler);
mailTemplateRouter.post("/mail-templates", createMailTemplateHandler);
mailTemplateRouter.put("/mail-templates/:templateId", updateMailTemplateHandler);
mailTemplateRouter.delete("/mail-templates/:templateId", deleteMailTemplateHandler);

export default mailTemplateRouter;

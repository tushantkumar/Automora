import { Router } from "express";
import {
  getEmailIntegrationStatusHandler,
  getGmailAuthorizationUrlHandler,
  getInboxEmailsHandler,
  getInboxThreadHandler,
  getInboxAiReplyHandler,
  gmailCallbackHandler,
  syncGmailEmailsHandler,
  sendGmailEmailHandler,
  disconnectEmailIntegrationHandler,
} from "../controllers/emailIntegrationController.js";

const emailIntegrationRouter = Router();

emailIntegrationRouter.get("/email-integrations", getEmailIntegrationStatusHandler);
emailIntegrationRouter.get("/email-integrations/gmail/connect", getGmailAuthorizationUrlHandler);
emailIntegrationRouter.get("/email-integrations/gmail/callback", gmailCallbackHandler);
emailIntegrationRouter.post("/email-integrations/gmail/sync", syncGmailEmailsHandler);
emailIntegrationRouter.get("/emails", getInboxEmailsHandler);
emailIntegrationRouter.get("/emails/thread/:externalId", getInboxThreadHandler);
emailIntegrationRouter.post("/emails/send", sendGmailEmailHandler);
emailIntegrationRouter.post("/emails/ai-reply", getInboxAiReplyHandler);
emailIntegrationRouter.delete("/email-integrations/:provider", disconnectEmailIntegrationHandler);

export default emailIntegrationRouter;

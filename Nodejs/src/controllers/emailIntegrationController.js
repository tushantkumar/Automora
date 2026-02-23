import {
  getEmailIntegrationStatus,
  getGmailAuthorizationUrl,
  getInboxEmails,
  getInboxThread,
  getInboxAiReply,
  handleGmailCallback,
  syncGmailEmails,
  sendGmailEmail,
  disconnectEmailIntegration,
} from "../services/emailIntegrationService.js";

export const getEmailIntegrationStatusHandler = async (req, res) => {
  const result = await getEmailIntegrationStatus(req.headers.authorization || "");
  return res.status(result.status).json(result.body);
};

export const getGmailAuthorizationUrlHandler = async (req, res) => {
  const result = await getGmailAuthorizationUrl(req.headers.authorization || "");
  return res.status(result.status).json(result.body);
};

export const gmailCallbackHandler = async (req, res) => {
  try {
    const result = await handleGmailCallback({
      code: String(req.query.code || ""),
      state: String(req.query.state || ""),
    });

    if (result.status !== 200) {
      return res.status(result.status).send(`<html><body><h3>${result.body.message || "Unable to connect Gmail"}</h3></body></html>`);
    }

    return res.status(200).send(`
      <html>
        <body style="font-family: sans-serif; padding: 24px;">
          <h3>Gmail connected successfully</h3>
          <p>${result.body.syncedEmails || 0} emails imported to inbox.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'gmail_connected' }, '*');
            }
            window.close();
          </script>
        </body>
      </html>
    `);
  } catch {
    return res.status(500).send("<html><body><h3>Unable to connect Gmail right now.</h3></body></html>");
  }
};

export const syncGmailEmailsHandler = async (req, res) => {
  const result = await syncGmailEmails(req.headers.authorization || "");
  return res.status(result.status).json(result.body);
};

export const getInboxEmailsHandler = async (req, res) => {
  const result = await getInboxEmails(req.headers.authorization || "", req.query || {});
  return res.status(result.status).json(result.body);
};

export const sendGmailEmailHandler = async (req, res) => {
  const result = await sendGmailEmail(req.headers.authorization || "", req.body || {});
  return res.status(result.status).json(result.body);
};


export const disconnectEmailIntegrationHandler = async (req, res) => {
  const result = await disconnectEmailIntegration(req.headers.authorization || "", req.params.provider || "");
  return res.status(result.status).json(result.body);
};


export const getInboxThreadHandler = async (req, res) => {
  const result = await getInboxThread(req.headers.authorization || "", req.params.externalId || "");
  return res.status(result.status).json(result.body);
};


export const getInboxAiReplyHandler = async (req, res) => {
  const result = await getInboxAiReply(req.headers.authorization || "", req.body || {});
  return res.status(result.status).json(result.body);
};

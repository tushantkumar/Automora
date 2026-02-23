const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const toFriendlyDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

const toCurrency = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "-");
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
};

const invoiceSummarySection = (invoice) => {
  if (!invoice) return "";

  return `
    <div style="margin-top:24px;border:1px solid #e2e8f0;border-radius:10px;padding:16px;background:#f8fafc;">
      <h3 style="margin:0 0 12px;color:#0f172a;font-size:16px;">Invoice Details</h3>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px;color:#1e293b;">
        <tr>
          <td style="padding:10px;border:1px solid #e2e8f0;background:#ffffff;font-weight:600;">Invoice ID</td>
          <td style="padding:10px;border:1px solid #e2e8f0;background:#ffffff;">${escapeHtml(invoice.id)}</td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #e2e8f0;background:#ffffff;font-weight:600;">Amount</td>
          <td style="padding:10px;border:1px solid #e2e8f0;background:#ffffff;">${escapeHtml(toCurrency(invoice.amount))}</td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #e2e8f0;background:#ffffff;font-weight:600;">Status</td>
          <td style="padding:10px;border:1px solid #e2e8f0;background:#ffffff;">${escapeHtml(invoice.status)}</td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #e2e8f0;background:#ffffff;font-weight:600;">Due Date</td>
          <td style="padding:10px;border:1px solid #e2e8f0;background:#ffffff;">${escapeHtml(toFriendlyDate(invoice.due_date))}</td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #e2e8f0;background:#ffffff;font-weight:600;">Customer Name</td>
          <td style="padding:10px;border:1px solid #e2e8f0;background:#ffffff;">${escapeHtml(invoice.customer_name || "-")}</td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #e2e8f0;background:#ffffff;font-weight:600;">Customer Email</td>
          <td style="padding:10px;border:1px solid #e2e8f0;background:#ffffff;">${escapeHtml(invoice.customer_email || "-")}</td>
        </tr>
      </table>
    </div>
  `;
};

export const buildAutomationEmailLayout = ({ companyName, bodyHtml, invoice }) => `
  <!doctype html>
  <html>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
              <tr>
                <td style="padding:20px 24px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;">
                  <h1 style="margin:0;font-size:20px;">${escapeHtml(companyName || "Auto-X")}</h1>
                  <p style="margin:8px 0 0;font-size:13px;opacity:0.9;">Automation Notification</p>
                </td>
              </tr>
              <tr>
                <td style="padding:24px;line-height:1.6;font-size:15px;color:#0f172a;">
                  ${bodyHtml}
                  ${invoiceSummarySection(invoice)}
                </td>
              </tr>
              <tr>
                <td style="padding:16px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#475569;font-size:12px;">
                  Need help? Contact support at <a href="mailto:support@auto-x.local" style="color:#4f46e5;text-decoration:none;">support@auto-x.local</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
`;

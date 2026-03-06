import nodemailer from "nodemailer";
import { APP_BASE_URL, SMTP_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER } from "../config/constants.js";

const hasSmtpCredentials = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

export const isSmtpConfigured = () => hasSmtpCredentials;

const transporter = hasSmtpCredentials
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    })
  : nodemailer.createTransport({
      jsonTransport: true,
    });

const escapeHtml = (value) => String(value || "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const createTransactionalEmailTemplate = ({
  preheader,
  eyebrow,
  title,
  greeting,
  intro,
  actionLabel,
  actionUrl,
  highlights = [],
  footerNote,
}) => {
  const safePreheader = escapeHtml(preheader);
  const safeEyebrow = escapeHtml(eyebrow);
  const safeTitle = escapeHtml(title);
  const safeGreeting = escapeHtml(greeting);
  const safeIntro = escapeHtml(intro);
  const safeActionLabel = escapeHtml(actionLabel);
  const safeActionUrl = escapeHtml(actionUrl);
  const safeFooterNote = escapeHtml(footerNote);

  const highlightHtml = highlights.length
    ? `
      <div style="margin:20px 0;padding:16px;border-radius:12px;background:#F8FAFC;border:1px solid #E2E8F0;">
        ${highlights.map((item) => `<p style="margin:0 0 8px;font-size:14px;line-height:20px;color:#334155;">• ${escapeHtml(item)}</p>`).join("")}
      </div>
    `
    : "";

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0F172A;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">${safePreheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F1F5F9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#6D28D9 0%,#2563EB 100%);padding:22px 28px;">
                <p style="margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.82);font-weight:700;">${safeEyebrow}</p>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:30px;color:#ffffff;font-weight:800;">${safeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 12px;font-size:16px;line-height:24px;color:#0F172A;">${safeGreeting}</p>
                <p style="margin:0 0 18px;font-size:15px;line-height:24px;color:#334155;">${safeIntro}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 10px;">
                  <tr>
                    <td style="border-radius:10px;background:#4F46E5;">
                      <a href="${safeActionUrl}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${safeActionLabel}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#475569;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="margin:0;font-size:13px;line-height:20px;word-break:break-all;"><a href="${safeActionUrl}" style="color:#4F46E5;">${safeActionUrl}</a></p>
                ${highlightHtml}
                <p style="margin:18px 0 0;font-size:13px;line-height:20px;color:#64748B;">${safeFooterNote}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
                <p style="margin:0;font-size:12px;line-height:18px;color:#64748B;">© ${new Date().getFullYear()} Automora · Secure workflow automation for modern teams</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const createOtpEmailTemplate = ({ name, otp, expiresInMinutes }) => {
  const safeName = escapeHtml(name || "there");
  const safeOtp = escapeHtml(otp);
  const minutes = Number.isFinite(expiresInMinutes) ? expiresInMinutes : 10;

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Automora account deletion verification</title>
  </head>
  <body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0F172A;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F1F5F9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#B91C1C 0%,#DC2626 100%);padding:22px 28px;">
                <p style="margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.82);font-weight:700;">Automora Security</p>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:30px;color:#ffffff;font-weight:800;">Confirm account deletion</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 12px;font-size:16px;line-height:24px;color:#0F172A;">Hi ${safeName},</p>
                <p style="margin:0 0 18px;font-size:15px;line-height:24px;color:#334155;">Use the one-time verification code below to confirm permanent account deletion.</p>
                <div style="display:inline-block;padding:14px 18px;border-radius:12px;background:#FEE2E2;border:1px solid #FCA5A5;">
                  <span style="font-size:30px;letter-spacing:8px;font-weight:800;color:#991B1B;">${safeOtp}</span>
                </div>
                <p style="margin:18px 0 0;font-size:14px;line-height:22px;color:#334155;">This OTP expires in <strong>${minutes} minutes</strong>. Never share this code with anyone.</p>
                <p style="margin:12px 0 0;font-size:13px;line-height:20px;color:#64748B;">If you did not request account deletion, ignore this email and your account will remain secure.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
                <p style="margin:0;font-size:12px;line-height:18px;color:#64748B;">© ${new Date().getFullYear()} Automora · Security verification message</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const logMail = (type, userEmail, messageId, link) => {
  console.log(`[mail] ${type} email queued`, {
    to: userEmail,
    messageId,
    transport: hasSmtpCredentials ? "smtp" : "json",
  });

  if (!hasSmtpCredentials) {
    console.log("[mail] development preview", { link });
  }
};

export const sendVerificationEmail = async (userEmail, verificationToken) => {
  const verificationLink = `${APP_BASE_URL}/verify-email?token=${verificationToken}`;
  const html = createTransactionalEmailTemplate({
    preheader: "Verify your Automora account to activate your workspace.",
    eyebrow: "Account Verification",
    title: "Verify your email address",
    greeting: "Welcome to Automora 👋",
    intro: "Please confirm your email to secure your account and complete workspace activation.",
    actionLabel: "Verify Email",
    actionUrl: verificationLink,
    highlights: ["Verification link is valid for 24 hours", "You can safely ignore this email if you didn’t sign up"],
    footerNote: "For your security, never share account links with others.",
  });

  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject: "Verify your Automora account",
    text: `Welcome to Automora! Verify your account by opening this link: ${verificationLink}`,
    html,
  });

  logMail("verification", userEmail, info.messageId, verificationLink);
};

export const sendPasswordResetEmail = async (userEmail, resetToken) => {
  const resetLink = `${APP_BASE_URL}/reset-password?token=${resetToken}`;
  const html = createTransactionalEmailTemplate({
    preheader: "Reset your Automora password securely.",
    eyebrow: "Password Reset",
    title: "Reset your password",
    greeting: "We received a password reset request",
    intro: "Click below to create a new password and regain access to your account.",
    actionLabel: "Reset Password",
    actionUrl: resetLink,
    highlights: ["Reset link expires in 1 hour", "If you didn’t request this, no changes have been made"],
    footerNote: "Automora will never ask for your password over email.",
  });

  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject: "Reset your Automora password",
    text: `Reset your password using this link (valid for 1 hour): ${resetLink}`,
    html,
  });

  logMail("password reset", userEmail, info.messageId, resetLink);
};


export const sendBasicEmail = async ({ to, subject, text, html }) => {
  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    text,
    html: html || `<p>${String(text || "").split("\n").join("<br/>")}</p>`,
  });

  logMail("automation", to, info.messageId);
};


export const sendAccountDeletionOtpEmail = async ({ userEmail, name, otp, expiresInMinutes }) => {
  const minutes = Number.isFinite(expiresInMinutes) ? expiresInMinutes : 10;

  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject: "Automora account deletion verification code",
    text: `Hi ${name || "there"},\n\nUse this OTP to confirm account deletion: ${otp}\nThis code is valid for ${minutes} minutes.\n\nIf you did not request account deletion, please ignore this email.`,
    html: createOtpEmailTemplate({ name, otp, expiresInMinutes: minutes }),
  });

  logMail("account deletion otp", userEmail, info.messageId);
};


export const sendUserInvitationEmail = async ({ userEmail, inviterName, inviteeName, role, activationLink, expiresInHours }) => {
  const safeInvitee = escapeHtml(inviteeName || "there");
  const safeInviter = escapeHtml(inviterName || "Automora Admin");
  const safeRole = escapeHtml(role || "Viewer");
  const safeLink = escapeHtml(activationLink || "");
  const hours = Number.isFinite(expiresInHours) ? expiresInHours : 24;

  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject: "You're invited to Automora",
    text: `Hi ${inviteeName || "there"},

${inviterName || "An admin"} invited you to Automora as ${role}.
Activate your account using this secure link: ${activationLink}
This link expires in ${hours} hours.

If you were not expecting this invitation, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
        <h2 style="margin:0 0 12px">You're invited to Automora</h2>
        <p>Hi ${safeInvitee},</p>
        <p>${safeInviter} invited you to Automora as <b>${safeRole}</b>.</p>
        <p>Please activate your account using this secure link:</p>
        <p><a href="${safeLink}">${safeLink}</a></p>
        <p>This link expires in <b>${hours} hours</b>.</p>
        <p>If you were not expecting this invitation, you can ignore this email.</p>
      </div>
    `,
  });

  logMail("user invitation", userEmail, info.messageId, activationLink);
};

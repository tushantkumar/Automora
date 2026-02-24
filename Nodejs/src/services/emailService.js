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

  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject: "Verify your Auto-X account",
    text: `Welcome to Auto-X! Verify your account by opening this link: ${verificationLink}`,
    html: `<p>Welcome to <b>Auto-X</b>!</p><p>Verify your account by clicking <a href="${verificationLink}">this link</a>.</p>`,
  });

  logMail("verification", userEmail, info.messageId, verificationLink);
};

export const sendPasswordResetEmail = async (userEmail, resetToken) => {
  const resetLink = `${APP_BASE_URL}/reset-password?token=${resetToken}`;

  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject: "Reset your Auto-X password",
    text: `Reset your password using this link (valid for 1 hour): ${resetLink}`,
    html: `<p>Reset your password by clicking <a href="${resetLink}">this link</a>. This link is valid for 1 hour.</p>`,
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


const escapeHtml = (value) => String(value || "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

export const sendAccountDeletionOtpEmail = async ({ userEmail, name, otp, expiresInMinutes }) => {
  const safeName = escapeHtml(name || "there");
  const safeOtp = escapeHtml(otp);
  const minutes = Number.isFinite(expiresInMinutes) ? expiresInMinutes : 10;

  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject: "Auto-X account deletion verification code",
    text: `Hi ${name || "there"},\n\nUse this OTP to confirm account deletion: ${otp}\nThis code is valid for ${minutes} minutes.\n\nIf you did not request account deletion, please ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
        <h2 style="margin:0 0 12px">Delete Account Verification</h2>
        <p>Hi ${safeName},</p>
        <p>Use the following OTP to confirm deleting your Auto-X account:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:6px;padding:12px 16px;background:#f3f4f6;display:inline-block;border-radius:8px">${safeOtp}</div>
        <p style="margin-top:16px">This code is valid for <b>${minutes} minutes</b>.</p>
        <p>If you did not request this action, you can safely ignore this email.</p>
      </div>
    `,
  });

  logMail("account deletion otp", userEmail, info.messageId);
};

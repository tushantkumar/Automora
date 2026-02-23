import {
  createSession,
  createUserWithVerificationToken,
  deleteAccountDeleteOtp,
  deletePasswordResetToken,
  deleteUserAccountById,
  deleteUserByEmail,
  getAccountDeleteOtpDetails,
  getOnboardingDetailsByUserId,
  getPasswordResetTokenDetails,
  getUserByEmail,
  getUserBySessionToken,
  getVerificationTokenDetails,
  resetPasswordByToken,
  upsertAccountDeleteOtp,
  upsertOnboardingDetails,
  upsertPasswordResetToken,
  verifyUserEmailAndCreateSession,
} from "../db/authRepository.js";
import { createToken, createUserId, hashPassword, normalizeEmail, verifyPassword } from "../utils/auth.js";
import { sendAccountDeletionOtpEmail, sendPasswordResetEmail, sendVerificationEmail } from "./emailService.js";

export const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  status: String(user.status || "Active"),
  platformTier: String(user.platform_tier || "free"),
  subscriptionPlan: String(user.subscription_plan || "Starter"),
  createdAt: user.created_at,
  isVerified: user.is_verified,
  onboardingCompleted: Boolean(user.onboarding_completed),
  organizationName: user.organization_name || null,
});

export const signup = async ({ name, email, password }) => {
  const cleanEmail = normalizeEmail(email);

  if (!name || !cleanEmail || !password) {
    return { status: 400, body: { message: "name, email and password are required" } };
  }

  if (password.length < 8) {
    return { status: 400, body: { message: "password must be at least 8 characters" } };
  }

  const existingUser = await getUserByEmail(cleanEmail);
  if (existingUser) {
    return { status: 409, body: { message: "email already registered" } };
  }

  const userPayload = {
    id: createUserId(),
    name: String(name).trim(),
    email: cleanEmail,
    passwordHash: hashPassword(password),
    verificationToken: createToken(),
  };

  let createdUser;

  try {
    createdUser = await createUserWithVerificationToken(userPayload);
  } catch {
    return { status: 500, body: { message: "unable to create account. please try again" } };
  }

  try {
    await sendVerificationEmail(cleanEmail, userPayload.verificationToken);
  } catch {
    await deleteUserByEmail(cleanEmail);
    return { status: 500, body: { message: "unable to send verification email. please try again" } };
  }

  return {
    status: 201,
    body: {
      message: "signup successful. we sent a verification link to your email",
      user: publicUser(createdUser),
    },
  };
};

export const verifyEmail = async ({ token }) => {
  const verificationToken = String(token || "").trim();
  const tokenDetails = await getVerificationTokenDetails(verificationToken);

  if (!tokenDetails) {
    return { status: 400, body: { message: "invalid or expired verification token" } };
  }

  if (tokenDetails.is_expired) {
    await deleteUserByEmail(tokenDetails.email);
    return {
      status: 410,
      body: {
        message: "verification token expired after 24 hours. account removed, please sign up again",
      },
    };
  }

  const authToken = createToken();

  try {
    const verifiedUser = await verifyUserEmailAndCreateSession({
      email: tokenDetails.email,
      verificationToken,
      sessionToken: authToken,
    });

    if (!verifiedUser) {
      return { status: 404, body: { message: "user not found" } };
    }

    return {
      status: 200,
      body: {
        message: "email verified successfully",
        token: authToken,
        user: publicUser(verifiedUser),
      },
    };
  } catch {
    return { status: 500, body: { message: "could not verify email" } };
  }
};

export const requestPasswordReset = async ({ email }) => {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail) {
    return { status: 400, body: { message: "email is required" } };
  }

  const user = await getUserByEmail(cleanEmail);
  if (!user) {
    return {
      status: 200,
      body: {
        message: "if the email exists, a reset link has been sent",
      },
    };
  }

  const resetToken = createToken();
  await upsertPasswordResetToken({ email: cleanEmail, token: resetToken });

  try {
    await sendPasswordResetEmail(cleanEmail, resetToken);
  } catch {
    return { status: 500, body: { message: "unable to send reset email. please try again" } };
  }

  return {
    status: 200,
    body: {
      message: "if the email exists, a reset link has been sent",
    },
  };
};

export const resetPassword = async ({ token, password }) => {
  const resetToken = String(token || "").trim();

  if (!resetToken || !password) {
    return { status: 400, body: { message: "token and password are required" } };
  }

  if (password.length < 8) {
    return { status: 400, body: { message: "password must be at least 8 characters" } };
  }

  const tokenDetails = await getPasswordResetTokenDetails(resetToken);

  if (!tokenDetails) {
    return { status: 400, body: { message: "invalid or expired reset token" } };
  }

  if (tokenDetails.is_expired) {
    await deletePasswordResetToken(resetToken);
    return { status: 410, body: { message: "reset token expired. request a new one" } };
  }

  const passwordHash = hashPassword(password);

  try {
    const changed = await resetPasswordByToken({
      token: resetToken,
      email: tokenDetails.email,
      passwordHash,
    });

    if (!changed) {
      return { status: 404, body: { message: "user not found" } };
    }

    return { status: 200, body: { message: "password reset successful" } };
  } catch {
    return { status: 500, body: { message: "unable to reset password" } };
  }
};

const getAuthorizedUser = async (authHeader) => {
  const token = String(authHeader || "").startsWith("Bearer ") ? String(authHeader).slice(7) : "";
  const user = await getUserBySessionToken(token);
  return user || null;
};

export const saveOnboardingDetails = async (authHeader, payload) => {
  const user = await getAuthorizedUser(authHeader);

  if (!user) {
    return { status: 401, body: { message: "unauthorized" } };
  }

  const industry = String(payload.industry || "").trim();
  const businessBio = String(payload.businessBio || "").trim();
  const organizationName = String(payload.organizationName || "").trim();
  const automationUse = String(payload.automationUse || "").trim();
  const clientsCount = Number(payload.clientsCount);
  const selectedAutomations = Array.isArray(payload.selectedAutomations)
    ? payload.selectedAutomations.map((value) => String(value)).filter(Boolean)
    : [];

  if (
    !industry ||
    !businessBio ||
    !organizationName ||
    !automationUse ||
    !Number.isFinite(clientsCount) ||
    clientsCount < 1 ||
    selectedAutomations.length === 0
  ) {
    return {
      status: 400,
      body: {
        message: "industry, businessBio, organizationName, clientsCount, automationUse and selectedAutomations are required",
      },
    };
  }

  await upsertOnboardingDetails({
    userId: user.id,
    industry,
    businessBio,
    organizationName,
    clientsCount,
    automationUse,
    selectedAutomations,
  });

  return {
    status: 200,
    body: {
      message: "onboarding details saved",
    },
  };
};

export const getOnboardingDetails = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);

  if (!user) {
    return { status: 401, body: { message: "unauthorized" } };
  }

  const details = await getOnboardingDetailsByUserId(user.id);

  return {
    status: 200,
    body: {
      onboardingCompleted: Boolean(details),
      details,
    },
  };
};

export const login = async ({ email, password }) => {
  const cleanEmail = normalizeEmail(email);
  const user = await getUserByEmail(cleanEmail);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return { status: 401, body: { message: "invalid email or password" } };
  }

  if (!user.is_verified) {
    return { status: 403, body: { message: "please verify your email before logging in" } };
  }

  const token = createToken();
  await createSession({ token, userId: user.id });

  return {
    status: 200,
    body: {
      message: "login successful",
      token,
      user: publicUser(user),
    },
  };
};

export const me = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);

  if (!user) {
    return { status: 401, body: { message: "unauthorized" } };
  }

  return { status: 200, body: { user: publicUser(user) } };
};


const ACCOUNT_DELETE_OTP_VALIDITY_MINUTES = 10;

const generateSixDigitOtp = () => String(Math.floor(100000 + Math.random() * 900000));

export const requestAccountDeletionOtp = async (authHeader) => {
  const user = await getAuthorizedUser(authHeader);

  if (!user) {
    return { status: 401, body: { message: "unauthorized" } };
  }

  const otp = generateSixDigitOtp();
  const otpHash = hashPassword(otp);
  const expiresAt = new Date(Date.now() + ACCOUNT_DELETE_OTP_VALIDITY_MINUTES * 60 * 1000);

  try {
    await upsertAccountDeleteOtp({ userId: user.id, otpHash, expiresAt });
    await sendAccountDeletionOtpEmail({
      userEmail: user.email,
      name: user.name,
      otp,
      expiresInMinutes: ACCOUNT_DELETE_OTP_VALIDITY_MINUTES,
    });

    return {
      status: 200,
      body: {
        message: "OTP sent to your registered email",
        expiresInMinutes: ACCOUNT_DELETE_OTP_VALIDITY_MINUTES,
      },
    };
  } catch {
    return { status: 500, body: { message: "unable to send delete account OTP" } };
  }
};

export const deleteAccountWithOtp = async (authHeader, payload) => {
  const user = await getAuthorizedUser(authHeader);

  if (!user) {
    return { status: 401, body: { message: "unauthorized" } };
  }

  const otp = String(payload?.otp || "").trim();
  if (!/^\d{6}$/.test(otp)) {
    return { status: 400, body: { message: "valid 6-digit OTP is required" } };
  }

  const otpDetails = await getAccountDeleteOtpDetails(user.id);

  if (!otpDetails) {
    return { status: 404, body: { message: "delete account OTP not found. request OTP again" } };
  }

  if (otpDetails.is_expired) {
    await deleteAccountDeleteOtp(user.id);
    return { status: 410, body: { message: "OTP expired. request a new OTP" } };
  }

  if (!verifyPassword(otp, otpDetails.otp_hash)) {
    return { status: 401, body: { message: "invalid OTP" } };
  }

  try {
    await deleteAccountDeleteOtp(user.id);
    await deleteUserAccountById(user.id);

    return { status: 200, body: { message: "account deleted successfully" } };
  } catch {
    return { status: 500, body: { message: "unable to delete account" } };
  }
};

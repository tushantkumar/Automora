import { Router } from "express";
import {
  deleteAccountWithOtpHandler,
  forgotPasswordHandler,
  getOnboardingHandler,
  loginHandler,
  meHandler,
  requestDeleteAccountOtpHandler,
  resetPasswordHandler,
  saveOnboardingHandler,
  signupHandler,
  verifyEmailHandler,
} from "../controllers/authController.js";

const authRouter = Router();

authRouter.post("/signup", signupHandler);
authRouter.get("/verify-email", verifyEmailHandler);
authRouter.post("/forgot-password", forgotPasswordHandler);
authRouter.post("/reset-password", resetPasswordHandler);
authRouter.get("/onboarding", getOnboardingHandler);
authRouter.post("/onboarding", saveOnboardingHandler);
authRouter.post("/login", loginHandler);
authRouter.get("/me", meHandler);

authRouter.post("/account/delete/request-otp", requestDeleteAccountOtpHandler);
authRouter.delete("/account", deleteAccountWithOtpHandler);

export default authRouter;

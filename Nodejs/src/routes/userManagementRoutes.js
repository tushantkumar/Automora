import { Router } from "express";
import {
  activateInviteHandler,
  changeUserRoleHandler,
  disableUserHandler,
  deleteUserHandler,
  inviteUserHandler,
  listManagedUsersHandler,
  resendInviteHandler,
  validateInviteTokenHandler,
} from "../controllers/userManagementController.js";

const userManagementRouter = Router();

userManagementRouter.get("/admin/users", listManagedUsersHandler);
userManagementRouter.post("/admin/users/invite", inviteUserHandler);
userManagementRouter.post("/admin/users/:email/resend-invite", resendInviteHandler);
userManagementRouter.patch("/admin/users/:userId/role", changeUserRoleHandler);
userManagementRouter.patch("/admin/users/:userId/disable", disableUserHandler);
userManagementRouter.delete("/admin/users/:userId", deleteUserHandler);
userManagementRouter.get("/invites/validate", validateInviteTokenHandler);
userManagementRouter.post("/invites/activate", activateInviteHandler);

export default userManagementRouter;

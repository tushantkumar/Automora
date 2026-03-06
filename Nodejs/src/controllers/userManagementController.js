import {
  activateInvitedUser,
  changeManagedUserRole,
  disableManagedUser,
  deleteManagedUser,
  inviteUserForAdmin,
  listUsersForAdmin,
  resendInviteForAdmin,
  validateInviteActivationToken,
} from "../services/userManagementService.js";

export const listManagedUsersHandler = async (req, res) => {
  const result = await listUsersForAdmin(req.headers.authorization);
  return res.status(result.status).json(result.body);
};

export const inviteUserHandler = async (req, res) => {
  const result = await inviteUserForAdmin(req.headers.authorization, req.body || {});
  return res.status(result.status).json(result.body);
};

export const resendInviteHandler = async (req, res) => {
  const result = await resendInviteForAdmin(req.headers.authorization, req.params.email);
  return res.status(result.status).json(result.body);
};

export const changeUserRoleHandler = async (req, res) => {
  const result = await changeManagedUserRole(req.headers.authorization, req.params.userId, req.body || {});
  return res.status(result.status).json(result.body);
};

export const disableUserHandler = async (req, res) => {
  const result = await disableManagedUser(req.headers.authorization, req.params.userId, req.body || {});
  return res.status(result.status).json(result.body);
};

export const validateInviteTokenHandler = async (req, res) => {
  const result = await validateInviteActivationToken(req.query?.token);
  return res.status(result.status).json(result.body);
};

export const activateInviteHandler = async (req, res) => {
  const result = await activateInvitedUser(req.body || {});
  return res.status(result.status).json(result.body);
};


export const deleteUserHandler = async (req, res) => {
  const result = await deleteManagedUser(req.headers.authorization, req.params.userId);
  return res.status(result.status).json(result.body);
};

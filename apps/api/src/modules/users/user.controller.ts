import type { Request, Response } from 'express';
import {
  asyncHandler,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as userService from './user.service';
import type {
  AssignRolesInput,
  ChangeUserStatusInput,
  InviteUserInput,
  ListUsersQuery,
  ResetPasswordInput,
  UpdateUserInput,
} from './user.schema';

export const listUsersHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await userService.listUsers(
    requirePrincipal(req),
    req.query as unknown as ListUsersQuery,
  );
  sendPaginated(res, page);
});

export const getUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getUser(requirePrincipal(req), req.params.userId as string);
  sendSuccess(res, user);
});

export const inviteUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.inviteUser(requirePrincipal(req), req.body as InviteUserInput);
  sendCreated(res, user, `/api/v1/users/${user.id}`);
});

export const updateUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.updateUser(
    requirePrincipal(req),
    req.params.userId as string,
    req.body as UpdateUserInput,
  );
  sendSuccess(res, user);
});

export const changeUserStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.changeUserStatus(
    requirePrincipal(req),
    req.params.userId as string,
    req.body as ChangeUserStatusInput,
  );
  sendSuccess(res, user);
});

export const assignRolesHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.assignRoles(
    requirePrincipal(req),
    req.params.userId as string,
    req.body as AssignRolesInput,
  );
  sendSuccess(res, user);
});

export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  await userService.resetPassword(
    requirePrincipal(req),
    req.params.userId as string,
    req.body as ResetPasswordInput,
  );
  sendNoContent(res);
});

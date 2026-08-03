import { z } from 'zod';
import { enumSchema } from '@aegisdrive/shared';
import { RoleName } from '@aegisdrive/types';

export const roleNameParamSchema = z.object({ name: enumSchema(RoleName) });

export type RoleNameParam = z.infer<typeof roleNameParamSchema>;

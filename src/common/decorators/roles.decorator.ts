import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma-generated/client';

export const ROLES_KEY = 'roles';

/** Restrict a route handler to the listed roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

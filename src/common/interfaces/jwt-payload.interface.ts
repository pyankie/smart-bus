import type { UserRole } from '@prisma-generated/client';

export interface JwtPayload {
  sub: string; // userId
  role: UserRole;
  phone: string;
}

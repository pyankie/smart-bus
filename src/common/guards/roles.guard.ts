import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma-generated/client';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() metadata — endpoint is open to any authenticated user
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = req.user;

    return user != null && required.includes(user.role);
  }
}

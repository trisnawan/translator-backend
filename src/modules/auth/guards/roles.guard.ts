import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedAccount } from '../../../common/interfaces/authenticated-account.interface';
import { Request } from 'express';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { AccountRole } from '../../../common/enums';
import { AppException } from '../../../common/exceptions/app.exception';

/**
 * Global guard enforcing the `@Roles(...)` metadata of a route.
 * Routes without the decorator are allowed for every authenticated account.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AccountRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedAccount }>();
    const account = request.user;

    if (!account) {
      throw AppException.unauthorized(
        'This endpoint requires an authenticated account',
      );
    }

    if (!requiredRoles.includes(account.role)) {
      throw AppException.forbidden(
        `This endpoint requires one of the following roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}

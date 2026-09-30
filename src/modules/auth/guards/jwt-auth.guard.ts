import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { RecordStatus } from '../../../common/enums';
import { AppException } from '../../../common/exceptions/app.exception';
import { AccountsService } from '../../accounts/accounts.service';
import { TokensService } from '../../tokens/tokens.service';

/**
 * Global guard protecting every route with an admin/client access token.
 *
 * The token is read either from the `Authorization: Bearer ...` header or from
 * the `access_token` cookie, both are equivalent. Routes marked with `@Public()`
 * (health, login) are skipped.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly tokensService: TokensService,
    private readonly accountsService: AccountsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: unknown }>();
    const token = this.extractToken(request);

    if (!token) {
      throw AppException.unauthorized(
        'Access token is required (send it as an Authorization: Bearer header or as the access_token cookie)',
      );
    }

    const payload = await this.tokensService.verifyAccountToken(token);
    const account = await this.accountsService
      .findById(payload.sub)
      .catch(() => null);

    if (!account) {
      throw AppException.unauthorized(
        'The account of this token no longer exists',
      );
    }

    if (account.status !== RecordStatus.ACTIVE) {
      throw AppException.forbidden('Your account is inactive');
    }

    request.user = this.accountsService.toAuthenticatedAccount(account);

    return true;
  }

  private extractToken(request: Request): string | null {
    const authorization = request.headers.authorization;

    if (authorization && authorization.toLowerCase().startsWith('bearer ')) {
      const token = authorization.slice(7).trim();

      if (token.length > 0) {
        return token;
      }
    }

    const cookieName = this.configService.getOrThrow<string>(
      'security.jwtCookieName',
    );
    // `request.cookies` is untyped in the express typings, so it is narrowed here.
    const cookies = (
      request as unknown as { cookies?: Record<string, unknown> }
    ).cookies;
    const cookieToken = cookies?.[cookieName];

    return typeof cookieToken === 'string' && cookieToken.length > 0
      ? cookieToken
      : null;
  }
}

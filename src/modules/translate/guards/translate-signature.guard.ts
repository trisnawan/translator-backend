import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RecordStatus } from '../../../common/enums';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  AuthenticatedAccount,
  TranslateIdentity,
} from '../../../common/interfaces/authenticated-account.interface';
import { AccountKeysService } from '../../account-keys/account-keys.service';
import { AccountsService } from '../../accounts/accounts.service';
import { TokensService } from '../../tokens/tokens.service';
import { TranslateRequestDto } from '../dto/translate-request.dto';

type TranslateRequest = Request & {
  user?: AuthenticatedAccount;
  translate?: TranslateIdentity;
};

/**
 * Authentication of `POST /translate` (and of any endpoint using the client
 * credential flow):
 *
 * 1. read the `key_id` header and load the matching `account_keys` row;
 * 2. verify the `Authorization: Bearer <jwt>` token with the decrypted
 *    `secret_key` of that row (HMAC), so only the key owner could have signed it;
 * 3. ensure the token payload (`account_id`, `reference_id`) matches the request
 *    body, which prevents replaying a signature for another payload;
 * 4. make sure the account is still active.
 */
@Injectable()
export class TranslateSignatureGuard implements CanActivate {
  constructor(
    private readonly accountKeysService: AccountKeysService,
    private readonly accountsService: AccountsService,
    private readonly tokensService: TokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TranslateRequest>();
    const keyId = this.readKeyId(request);
    const token = this.readBearerToken(request);
    const referenceId = this.readReferenceId(request);

    const { key, secretKey } =
      await this.accountKeysService.resolveSecret(keyId);
    const payload = await this.tokensService.verifySignatureToken(
      secretKey,
      token,
    );

    if (payload.account_id !== key.accountId) {
      throw AppException.unauthorized(
        'The account_id of the signature token does not match the owner of the key',
      );
    }

    if (String(payload.reference_id) !== referenceId) {
      throw AppException.unauthorized(
        'The reference_id of the signature token does not match reference_id of the request body',
      );
    }

    const account = await this.accountsService
      .findById(key.accountId)
      .catch(() => null);

    if (!account) {
      throw AppException.unauthorized(
        'The account of this key no longer exists',
      );
    }

    if (account.status !== RecordStatus.ACTIVE) {
      throw AppException.forbidden('Your account is inactive');
    }

    request.user = this.accountsService.toAuthenticatedAccount(account);
    request.translate = {
      accountId: account.id,
      keyId: key.id,
      referenceId,
      callbackUrl: key.callbackUrl,
    };

    return true;
  }

  private readKeyId(request: Request): string {
    const keyId = request.headers['key_id'] ?? request.headers['key-id'];

    if (typeof keyId !== 'string' || keyId.trim().length === 0) {
      throw AppException.unauthorized('The key_id header is required');
    }

    return keyId.trim();
  }

  private readBearerToken(request: Request): string {
    const authorization = request.headers.authorization;

    if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
      throw AppException.unauthorized(
        'An Authorization: Bearer <token> header signed with the account key secret is required',
      );
    }

    const token = authorization.slice(7).trim();

    if (token.length === 0) {
      throw AppException.unauthorized('The bearer token is empty');
    }

    return token;
  }

  private readReferenceId(request: Request): string {
    const body = request.body as Partial<TranslateRequestDto> | undefined;
    const referenceId = body?.reference_id;

    if (
      referenceId === undefined ||
      referenceId === null ||
      String(referenceId).trim().length === 0
    ) {
      throw AppException.badRequest('reference_id is required');
    }

    return String(referenceId);
  }
}

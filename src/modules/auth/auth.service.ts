import { Injectable, Logger } from '@nestjs/common';
import { RecordStatus } from '../../common/enums';
import { AppException } from '../../common/exceptions/app.exception';
import { AuthenticatedAccount } from '../../common/interfaces/authenticated-account.interface';
import { Account } from '../accounts/entities/account.entity';
import { AccountsService } from '../accounts/accounts.service';
import { PasswordService } from '../security/password.service';
import { TokensService } from '../tokens/tokens.service';
import { AccessTokenResponse } from './dto/access-token-response.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly accountsService: AccountsService,
    private readonly passwordService: PasswordService,
    private readonly tokensService: TokensService,
  ) {}

  /** Verifies the credentials and issues an access token. */
  async login(dto: LoginDto): Promise<AccessTokenResponse> {
    const account = await this.accountsService.findByEmailWithPassword(
      dto.email,
    );

    if (!account || !account.password) {
      throw AppException.unauthorized('Email or password is incorrect');
    }

    const passwordMatches = await this.passwordService.compare(
      dto.password,
      account.password,
    );

    if (!passwordMatches) {
      throw AppException.unauthorized('Email or password is incorrect');
    }

    if (account.status !== RecordStatus.ACTIVE) {
      throw AppException.forbidden(
        'Your account is inactive, please contact the administrator',
      );
    }

    this.logger.log(`Account "${account.email}" logged in`);

    return this.issueToken(account);
  }

  /** Issues a new access token for an already authenticated account. */
  async refresh(account: AuthenticatedAccount): Promise<AccessTokenResponse> {
    return this.issueToken(await this.accountsService.assertActive(account.id));
  }

  async profile(
    account: AuthenticatedAccount,
  ): Promise<ReturnType<AccountsService['toResponse']>> {
    return this.accountsService.toResponse(
      await this.accountsService.findById(account.id),
    );
  }

  private async issueToken(account: Account): Promise<AccessTokenResponse> {
    const accessToken = await this.tokensService.signAccountToken(account);
    const expiresIn = this.tokensService.accessTokenTtl;

    return {
      token_type: 'Bearer',
      access_token: accessToken,
      expires_in: expiresIn,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      account: {
        id: account.id,
        full_name: account.fullName,
        email: account.email,
        role: account.role,
        status: account.status,
        max_rpm: account.maxRpm,
        max_rpd: account.maxRpd,
      },
    };
  }
}

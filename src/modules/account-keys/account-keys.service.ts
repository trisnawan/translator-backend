import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { AccountRole } from '../../common/enums';
import { AppException } from '../../common/exceptions/app.exception';
import { AuthenticatedAccount } from '../../common/interfaces/authenticated-account.interface';
import { normalizeOptionalString } from '../../common/utils/object.util';
import { isUuid, uuidToBuffer, uuidv7 } from '../../common/utils/uuid.util';
import { Account } from '../accounts/entities/account.entity';
import { CryptoService } from '../security/crypto.service';
import {
  AccountKeyCreatedResponse,
  AccountKeyResponse,
} from './dto/account-key-response.dto';
import { CreateAccountKeyDto } from './dto/create-account-key.dto';
import { ListAccountKeysQueryDto } from './dto/list-account-keys-query.dto';
import { UpdateAccountKeyDto } from './dto/update-account-key.dto';
import { AccountKey } from './entities/account-key.entity';

/** Credentials of a key, ready to be used to sign/verify a request. */
export interface ResolvedAccountKey {
  key: AccountKey;
  secretKey: string;
}

@Injectable()
export class AccountKeysService {
  private readonly logger = new Logger(AccountKeysService.name);

  constructor(
    @InjectRepository(AccountKey)
    private readonly accountKeysRepository: Repository<AccountKey>,
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
    private readonly cryptoService: CryptoService,
  ) {}

  async paginate(
    query: ListAccountKeysQueryDto,
    requester: AuthenticatedAccount,
  ): Promise<PaginatedResult<AccountKeyResponse>> {
    const builder = this.accountKeysRepository
      .createQueryBuilder('accountKey')
      .addSelect('accountKey.secretKey')
      .leftJoinAndSelect('accountKey.account', 'account');

    // Clients can only ever see their own keys.
    const accountId =
      requester.role === AccountRole.ADMIN ? query.account_id : requester.id;
    const binaryAccountId = accountId ? uuidToBuffer(accountId) : undefined;

    if (binaryAccountId) {
      builder.andWhere('accountKey.accountId = :accountId', {
        accountId: binaryAccountId,
      });
    }

    if (query.search) {
      builder.andWhere(
        '(account.email LIKE :search OR account.fullName LIKE :search OR accountKey.callbackUrl LIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }

    builder
      .orderBy(
        'accountKey.createdAt',
        query.order.toUpperCase() as 'ASC' | 'DESC',
      )
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();

    return PaginatedResult.from(
      items.map((item) => this.toResponse(item)),
      total,
      query.page,
      query.limit,
    );
  }

  async findDetail(
    id: string,
    requester: AuthenticatedAccount,
  ): Promise<AccountKeyResponse> {
    const key = await this.findById(id, requester);

    return this.toResponse(await this.loadWithSecret(key.id));
  }

  /** Loads a key and enforces the ownership rule for clients. */
  async findById(
    id: string,
    requester: AuthenticatedAccount,
  ): Promise<AccountKey> {
    const key = await this.accountKeysRepository.findOne({ where: { id } });

    if (!key) {
      throw AppException.notFound(`Account key "${id}" was not found`);
    }

    if (
      requester.role !== AccountRole.ADMIN &&
      key.accountId !== requester.id
    ) {
      throw AppException.forbidden('You can only access your own account keys');
    }

    return key;
  }

  /** Loads a key together with its encrypted secret. */
  async loadWithSecret(id: string): Promise<AccountKey> {
    const key = await this.accountKeysRepository
      .createQueryBuilder('key')
      .addSelect('key.secretKey')
      // Detail/update responses embed the account, like the list endpoint does.
      .leftJoinAndSelect('key.account', 'account')
      .where('key.id = :id', { id: uuidToBuffer(id) })
      .getOne();

    if (!key) {
      throw AppException.notFound(`Account key "${id}" was not found`);
    }

    return key;
  }

  /**
   * Resolves the credentials used to verify a signature token (`key_id` header)
   * or to sign an outgoing callback. Every failure is reported as `401` so the
   * endpoint does not leak whether a key id exists.
   */
  async resolveSecret(keyId: string): Promise<ResolvedAccountKey> {
    if (!isUuid(keyId)) {
      throw AppException.unauthorized('The key_id header must be a valid UUID');
    }

    const key = await this.accountKeysRepository
      .createQueryBuilder('key')
      .addSelect('key.secretKey')
      .where('key.id = :id', { id: uuidToBuffer(keyId) })
      .getOne();

    if (!key) {
      throw AppException.unauthorized(`Unknown account key "${keyId}"`);
    }

    if (!key.secretKey || key.secretKey.trim().length === 0) {
      throw AppException.unauthorized(
        `Account key "${keyId}" does not have a secret key configured`,
      );
    }

    return { key, secretKey: this.cryptoService.decrypt(key.secretKey) };
  }

  /** Fallback used by the callback worker when the original key no longer exists. */
  async findPrimaryForAccount(
    accountId: string,
  ): Promise<ResolvedAccountKey | null> {
    const key = await this.accountKeysRepository
      .createQueryBuilder('key')
      .addSelect('key.secretKey')
      .where('key.accountId = :accountId', {
        accountId: uuidToBuffer(accountId),
      })
      .orderBy('key.createdAt', 'ASC')
      .getOne();

    if (!key || !key.secretKey) {
      return null;
    }

    return { key, secretKey: this.cryptoService.decrypt(key.secretKey) };
  }

  async create(
    dto: CreateAccountKeyDto,
    requester: AuthenticatedAccount,
  ): Promise<AccountKeyCreatedResponse> {
    const accountId = this.resolveOwner(dto.account_id, requester);
    const account = await this.accountsRepository.findOne({
      where: { id: accountId },
    });

    if (!account) {
      throw AppException.badRequest(`Account "${accountId}" was not found`);
    }

    const secretKey =
      dto.secret_key && dto.secret_key.trim().length > 0
        ? dto.secret_key.trim()
        : this.generateSecretKey();
    const accountKey: AccountKey = {
      id: uuidv7(),
      accountId,
      secretKey: this.cryptoService.encrypt(secretKey),
      callbackUrl: normalizeOptionalString(dto.callback_url),
      createdAt: new Date(),
    };

    await this.accountKeysRepository.insert(accountKey);
    this.logger.log(
      `Account key "${accountKey.id}" created for account "${accountId}"`,
    );

    const response = this.toResponse({
      ...accountKey,
      account,
    }) as AccountKeyCreatedResponse;
    response.secret_key = secretKey;

    return response;
  }

  async update(
    id: string,
    dto: UpdateAccountKeyDto,
    requester: AuthenticatedAccount,
  ): Promise<AccountKeyResponse> {
    const key = await this.findById(id, requester);
    const payload: Record<string, unknown> = {};

    if (dto.secret_key !== undefined) {
      payload.secretKey = this.cryptoService.encrypt(dto.secret_key.trim());
    }

    if (dto.callback_url !== undefined) {
      payload.callbackUrl = normalizeOptionalString(dto.callback_url);
    }

    if (Object.keys(payload).length === 0) {
      throw AppException.badRequest('Nothing to update');
    }

    await this.accountKeysRepository.update({ id: key.id }, payload);

    return this.toResponse(await this.loadWithSecret(key.id));
  }

  async remove(id: string, requester: AuthenticatedAccount): Promise<void> {
    const key = await this.findById(id, requester);

    await this.accountKeysRepository.delete({ id: key.id });
    this.logger.log(`Account key "${key.id}" deleted`);
  }

  toResponse(key: AccountKey): AccountKeyResponse {
    return {
      id: key.id,
      account_id: key.accountId,
      account: key.account
        ? {
            id: key.account.id,
            full_name: key.account.fullName,
            email: key.account.email,
          }
        : null,
      callback_url: key.callbackUrl,
      secret_key_masked: this.maskSecret(key.secretKey),
      has_secret_key: Boolean(key.secretKey && key.secretKey.length > 0),
      created_at: key.createdAt,
    };
  }

  /**
   * The stored value is already encrypted, so only a fixed mask is exposed
   * (masking the ciphertext would leak its length and prefix).
   */
  private maskSecret(value: string | null): string | null {
    if (!value) {
      return null;
    }

    return this.cryptoService.isEncrypted(value)
      ? '********'
      : CryptoService.mask(value);
  }

  /** `sk_translator_<64 hex>`, only returned by `POST /account-keys/insert`. */
  generateSecretKey(): string {
    return `sk_translator_${randomBytes(32).toString('hex')}`;
  }

  private resolveOwner(
    requestedAccountId: string | undefined,
    requester: AuthenticatedAccount,
  ): string {
    if (requester.role === AccountRole.ADMIN) {
      return requestedAccountId ?? requester.id;
    }

    if (requestedAccountId && requestedAccountId !== requester.id) {
      throw AppException.forbidden(
        'You can only manage the keys of your own account',
      );
    }

    return requester.id;
  }
}

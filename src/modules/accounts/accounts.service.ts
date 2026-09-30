import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UNLIMITED } from '../../common/constants/app.constants';
import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { AccountRole, RecordStatus } from '../../common/enums';
import { AppException } from '../../common/exceptions/app.exception';
import { pickDefined } from '../../common/utils/object.util';
import { uuidv7 } from '../../common/utils/uuid.util';
import { PasswordService } from '../security/password.service';
import { AccountResponse } from './dto/account-response.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Account } from './entities/account.entity';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
    private readonly passwordService: PasswordService,
  ) {}

  async paginate(
    query: ListAccountsQueryDto,
  ): Promise<PaginatedResult<AccountResponse>> {
    const builder = this.accountsRepository.createQueryBuilder('account');

    if (query.search) {
      builder.andWhere(
        '(account.fullName LIKE :search OR account.email LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.status) {
      builder.andWhere('account.status = :status', { status: query.status });
    }

    if (query.role) {
      builder.andWhere('account.role = :role', { role: query.role });
    }

    builder
      .orderBy('account.createdAt', query.order.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();

    return PaginatedResult.from(
      items.map((account) => this.toResponse(account)),
      total,
      query.page,
      query.limit,
    );
  }

  async findById(id: string): Promise<Account> {
    const account = await this.accountsRepository.findOne({ where: { id } });

    if (!account) {
      throw AppException.notFound(`Account "${id}" was not found`);
    }

    return account;
  }

  /** Loads an account including its password hash, only used by the login flow. */
  async findByEmailWithPassword(email: string): Promise<Account | null> {
    return this.accountsRepository
      .createQueryBuilder('account')
      .addSelect('account.password')
      .where('account.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  async findByEmail(email: string): Promise<Account | null> {
    return this.accountsRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async create(dto: CreateAccountDto): Promise<AccountResponse> {
    const email = dto.email.toLowerCase();
    const existing = await this.findByEmail(email);

    if (existing) {
      throw AppException.conflict(
        `Account with email "${email}" already exists`,
      );
    }

    const account: Account = {
      id: uuidv7(),
      fullName: dto.full_name.trim(),
      email,
      password: await this.passwordService.hash(dto.password),
      role: dto.role ?? AccountRole.CLIENT,
      status: dto.status ?? RecordStatus.ACTIVE,
      maxRpm: dto.max_rpm ?? UNLIMITED,
      maxRpd: dto.max_rpd ?? UNLIMITED,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.accountsRepository.insert(account);
    this.logger.log(`Account "${email}" created (${account.role})`);

    return this.toResponse(account);
  }

  async update(id: string, dto: UpdateAccountDto): Promise<AccountResponse> {
    const account = await this.findById(id);

    if (dto.email && dto.email.toLowerCase() !== account.email) {
      const existing = await this.findByEmail(dto.email);

      if (existing && existing.id !== id) {
        throw AppException.conflict(
          `Account with email "${dto.email}" already exists`,
        );
      }
    }

    const payload = pickDefined<Record<string, unknown>>({
      fullName: dto.full_name?.trim(),
      email: dto.email?.toLowerCase(),
      role: dto.role,
      status: dto.status,
      maxRpm: dto.max_rpm,
      maxRpd: dto.max_rpd,
    });

    if (dto.password !== undefined) {
      payload.password = await this.passwordService.hash(dto.password);
    }

    if (Object.keys(payload).length === 0) {
      throw AppException.badRequest('Nothing to update');
    }

    // `updated_at` is maintained by the application (in UTC) instead of by a
    // MySQL `ON UPDATE CURRENT_TIMESTAMP` clause, see the DATETIME migration.
    payload.updatedAt = new Date();

    await this.accountsRepository.update({ id }, payload);

    return this.toResponse(await this.findById(id));
  }

  async remove(id: string, requesterId: string): Promise<void> {
    await this.findById(id);

    if (id === requesterId) {
      throw AppException.conflict('You cannot delete your own account');
    }

    await this.accountsRepository.delete({ id });
    this.logger.log(`Account "${id}" deleted`);
  }

  /** Used by the JWT guard: an account must exist and be active to pass. */
  async assertActive(id: string): Promise<Account> {
    const account = await this.findById(id);

    if (account.status !== RecordStatus.ACTIVE) {
      throw AppException.forbidden('Your account is inactive');
    }

    return account;
  }

  toResponse(account: Account): AccountResponse {
    return {
      id: account.id,
      full_name: account.fullName,
      email: account.email,
      role: account.role,
      status: account.status,
      max_rpm: account.maxRpm,
      max_rpd: account.maxRpd,
      created_at: account.createdAt,
      updated_at: account.updatedAt,
    };
  }

  /** Public shape used by the translate guard. */
  toAuthenticatedAccount(account: Account): {
    id: string;
    fullName: string;
    email: string;
    role: AccountRole;
    status: RecordStatus;
    maxRpm: number;
    maxRpd: number;
  } {
    return {
      id: account.id,
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      status: account.status,
      maxRpm: account.maxRpm,
      maxRpd: account.maxRpd,
    };
  }
}

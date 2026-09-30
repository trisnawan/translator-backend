import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { uuidToBuffer, uuidv7 } from '../../common/utils/uuid.util';
import { Account } from '../accounts/entities/account.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { AccountDriverResponse } from './dto/account-driver-response.dto';
import { CreateAccountDriverDto } from './dto/create-account-driver.dto';
import { ListAccountDriversQueryDto } from './dto/list-account-drivers-query.dto';
import { UpdateAccountDriverDto } from './dto/update-account-driver.dto';
import { AccountDriver } from './entities/account-driver.entity';

@Injectable()
export class AccountDriversService {
  private readonly logger = new Logger(AccountDriversService.name);

  constructor(
    @InjectRepository(AccountDriver)
    private readonly accountDriversRepository: Repository<AccountDriver>,
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
  ) {}

  async paginate(
    query: ListAccountDriversQueryDto,
  ): Promise<PaginatedResult<AccountDriverResponse>> {
    const builder = this.accountDriversRepository
      .createQueryBuilder('accountDriver')
      .leftJoinAndSelect('accountDriver.account', 'account')
      .leftJoinAndSelect('accountDriver.driver', 'driver');

    if (query.account_id) {
      builder.andWhere('accountDriver.accountId = :accountId', {
        accountId: uuidToBuffer(query.account_id),
      });
    }

    if (query.driver_id) {
      builder.andWhere('accountDriver.driverId = :driverId', {
        driverId: query.driver_id,
      });
    }

    if (query.search) {
      builder.andWhere(
        '(account.fullName LIKE :search OR account.email LIKE :search OR driver.name LIKE :search OR accountDriver.driverId LIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }

    builder
      .orderBy(
        'accountDriver.createdAt',
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

  async findById(id: string): Promise<AccountDriver> {
    const accountDriver = await this.accountDriversRepository.findOne({
      where: { id },
    });

    if (!accountDriver) {
      throw AppException.notFound(
        `Account driver access "${id}" was not found`,
      );
    }

    return accountDriver;
  }

  /** Driver ids assigned to an account, used to filter the driver list and `/translate`. */
  async findDriverIdsByAccount(accountId: string): Promise<string[]> {
    const rows = await this.accountDriversRepository.find({
      where: { accountId },
      select: { driverId: true },
      order: { driverId: 'ASC' },
    });

    return rows.map((row) => row.driverId);
  }

  /**
   * Guards `POST /translate`: the account must have the driver assigned through
   * `account_drivers`.
   */
  async assertDriverAccess(accountId: string, driverId: string): Promise<void> {
    const access = await this.accountDriversRepository.findOne({
      where: { accountId, driverId },
    });

    if (!access) {
      throw AppException.forbidden(
        `Your account does not have access to driver "${driverId}"`,
      );
    }
  }

  async create(dto: CreateAccountDriverDto): Promise<AccountDriverResponse> {
    await this.assertAccountExists(dto.account_id);
    await this.assertDriverExists(dto.driver_id);

    const existing = await this.accountDriversRepository.findOne({
      where: { accountId: dto.account_id, driverId: dto.driver_id },
    });

    if (existing) {
      throw AppException.conflict(
        `Account already has access to driver "${dto.driver_id}"`,
      );
    }

    const accountDriver: AccountDriver = {
      id: uuidv7(),
      accountId: dto.account_id,
      driverId: dto.driver_id,
      createdAt: new Date(),
    };

    await this.accountDriversRepository.insert(accountDriver);
    this.logger.log(
      `Driver "${dto.driver_id}" granted to account "${dto.account_id}"`,
    );

    return this.findDetail(accountDriver.id);
  }

  async update(
    id: string,
    dto: UpdateAccountDriverDto,
  ): Promise<AccountDriverResponse> {
    const accountDriver = await this.findById(id);
    const accountId = dto.account_id ?? accountDriver.accountId;
    const driverId = dto.driver_id ?? accountDriver.driverId;

    if (accountId !== accountDriver.accountId) {
      await this.assertAccountExists(accountId);
    }

    if (driverId !== accountDriver.driverId) {
      await this.assertDriverExists(driverId);

      const existing = await this.accountDriversRepository.findOne({
        where: { accountId, driverId },
      });

      if (existing && existing.id !== id) {
        throw AppException.conflict(
          `Account already has access to driver "${driverId}"`,
        );
      }
    }

    if (
      accountId === accountDriver.accountId &&
      driverId === accountDriver.driverId
    ) {
      throw AppException.badRequest('Nothing to update');
    }

    await this.accountDriversRepository.update({ id }, { accountId, driverId });

    return this.findDetail(id);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.accountDriversRepository.delete({ id });
    this.logger.log(`Account driver access "${id}" deleted`);
  }

  async findDetail(id: string): Promise<AccountDriverResponse> {
    const accountDriver = await this.accountDriversRepository
      .createQueryBuilder('accountDriver')
      .leftJoinAndSelect('accountDriver.account', 'account')
      .leftJoinAndSelect('accountDriver.driver', 'driver')
      .where('accountDriver.id = :id', { id: uuidToBuffer(id) })
      .getOne();

    if (!accountDriver) {
      throw AppException.notFound(
        `Account driver access "${id}" was not found`,
      );
    }

    return this.toResponse(accountDriver);
  }

  toResponse(accountDriver: AccountDriver): AccountDriverResponse {
    return {
      id: accountDriver.id,
      account_id: accountDriver.accountId,
      account: accountDriver.account
        ? {
            id: accountDriver.account.id,
            full_name: accountDriver.account.fullName,
            email: accountDriver.account.email,
          }
        : null,
      driver_id: accountDriver.driverId,
      driver: accountDriver.driver
        ? {
            id: accountDriver.driver.id,
            name: accountDriver.driver.name,
            type: accountDriver.driver.type,
            status: accountDriver.driver.status,
          }
        : null,
      created_at: accountDriver.createdAt,
    };
  }

  private async assertAccountExists(accountId: string): Promise<void> {
    const account = await this.accountsRepository.findOne({
      where: { id: accountId },
    });

    if (!account) {
      throw AppException.badRequest(`Account "${accountId}" was not found`);
    }
  }

  private async assertDriverExists(driverId: string): Promise<void> {
    const driver = await this.driversRepository.findOne({
      where: { id: driverId },
    });

    if (!driver) {
      throw AppException.badRequest(`Driver "${driverId}" was not found`);
    }
  }
}

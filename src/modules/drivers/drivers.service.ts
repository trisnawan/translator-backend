import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UNLIMITED } from '../../common/constants/app.constants';
import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { RecordStatus } from '../../common/enums';
import { AppException } from '../../common/exceptions/app.exception';
import { pickDefined } from '../../common/utils/object.util';
import { EngineRegistry } from '../engines/engine.registry';
import { CryptoService } from '../security/crypto.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { DriverResponse } from './dto/driver-response.dto';
import { ListDriversQueryDto } from './dto/list-drivers-query.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { Driver } from './entities/driver.entity';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
    private readonly engineRegistry: EngineRegistry,
    private readonly cryptoService: CryptoService,
  ) {}

  async paginate(
    query: ListDriversQueryDto,
    allowedDriverIds?: string[],
  ): Promise<PaginatedResult<DriverResponse>> {
    if (allowedDriverIds && allowedDriverIds.length === 0) {
      return PaginatedResult.from<DriverResponse>(
        [],
        0,
        query.page,
        query.limit,
      );
    }

    const builder = this.driversRepository
      .createQueryBuilder('driver')
      .addSelect('driver.secretKey');

    if (query.search) {
      builder.andWhere('(driver.id LIKE :search OR driver.name LIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    if (query.status) {
      builder.andWhere('driver.status = :status', { status: query.status });
    }

    if (query.type) {
      builder.andWhere('driver.type = :type', { type: query.type });
    }

    if (allowedDriverIds) {
      builder.andWhere('driver.id IN (:...allowedDriverIds)', {
        allowedDriverIds,
      });
    }

    builder
      .orderBy('driver.id', query.order.toUpperCase() as 'ASC' | 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [items, total] = await builder.getManyAndCount();

    return PaginatedResult.from(
      items.map((driver) => this.toResponse(driver)),
      total,
      query.page,
      query.limit,
    );
  }

  async findById(id: string): Promise<Driver> {
    const driver = await this.driversRepository.findOne({ where: { id } });

    if (!driver) {
      throw AppException.notFound(`Driver "${id}" was not found`);
    }

    return driver;
  }

  /** Loads a driver together with its encrypted credential. */
  async findByIdWithSecret(id: string): Promise<Driver> {
    const driver = await this.driversRepository
      .createQueryBuilder('driver')
      .addSelect('driver.secretKey')
      .where('driver.id = :id', { id })
      .getOne();

    if (!driver) {
      throw AppException.notFound(`Driver "${id}" was not found`);
    }

    return driver;
  }

  /** Driver ready to be used by the worker: exists, active and with a credential. */
  async findRunnable(
    id: string,
  ): Promise<{ driver: Driver; secretKey: string }> {
    const driver = await this.findByIdWithSecret(id);

    if (driver.status !== RecordStatus.ACTIVE) {
      throw AppException.badRequest(`Driver "${id}" is inactive`);
    }

    if (!driver.secretKey || driver.secretKey.trim().length === 0) {
      throw AppException.serviceUnavailable(
        `Driver "${id}" does not have a secret key configured yet`,
      );
    }

    return { driver, secretKey: this.cryptoService.decrypt(driver.secretKey) };
  }

  async create(dto: CreateDriverDto): Promise<DriverResponse> {
    const engine = this.engineRegistry.resolveProvider(dto.id);

    if (!engine) {
      throw AppException.badRequest(
        `Driver id "${dto.id}" does not match any engine. Supported prefixes: ${this.engineRegistry.supportedPrefixes.join(', ')}`,
      );
    }

    const existing = await this.driversRepository.findOne({
      where: { id: dto.id },
    });

    if (existing) {
      throw AppException.conflict(`Driver "${dto.id}" already exists`);
    }

    const secretKey = dto.secret_key?.trim();

    await this.driversRepository.insert({
      id: dto.id,
      type: dto.type,
      name: dto.name.trim(),
      status: dto.status ?? RecordStatus.ACTIVE,
      secretKey:
        secretKey && secretKey.length > 0
          ? this.cryptoService.encrypt(secretKey)
          : null,
      maxRpm: dto.max_rpm ?? UNLIMITED,
      maxRpd: dto.max_rpd ?? UNLIMITED,
    });

    return this.toResponse(await this.findByIdWithSecret(dto.id));
  }

  async update(id: string, dto: UpdateDriverDto): Promise<DriverResponse> {
    await this.findById(id);

    const payload = pickDefined<Record<string, unknown>>({
      type: dto.type,
      name: dto.name?.trim(),
      status: dto.status,
      maxRpm: dto.max_rpm,
      maxRpd: dto.max_rpd,
    });

    if (dto.secret_key !== undefined) {
      const secretKey = dto.secret_key.trim();
      payload.secretKey =
        secretKey.length > 0 ? this.cryptoService.encrypt(secretKey) : null;
    }

    if (Object.keys(payload).length === 0) {
      throw AppException.badRequest('Nothing to update');
    }

    await this.driversRepository.update({ id }, payload);
    this.logger.log(`Driver "${id}" updated`);

    return this.toResponse(await this.findByIdWithSecret(id));
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);

    const usedInHistories = await this.driversRepository.manager
      .createQueryBuilder()
      .select('history.id')
      .from('histories', 'history')
      .where('history.driver_id = :id', { id })
      .limit(1)
      .getRawOne<{ id: string }>();

    if (usedInHistories) {
      throw AppException.conflict(
        `Driver "${id}" is used by existing translation histories, set its status to inactive instead`,
      );
    }

    await this.driversRepository.delete({ id });
    this.logger.log(`Driver "${id}" deleted`);
  }

  toResponse(driver: Driver): DriverResponse {
    return {
      id: driver.id,
      type: driver.type,
      name: driver.name,
      status: driver.status,
      max_rpm: driver.maxRpm,
      max_rpd: driver.maxRpd,
      has_secret_key: Boolean(driver.secretKey && driver.secretKey.length > 0),
      engine: this.engineRegistry.resolveProvider(driver.id),
    };
  }
}

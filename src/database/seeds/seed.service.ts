import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { uuidv7 } from '../../common/utils/uuid.util';
import { AccountDriver } from '../../modules/account-drivers/entities/account-driver.entity';
import { AccountKey } from '../../modules/account-keys/entities/account-key.entity';
import { Account } from '../../modules/accounts/entities/account.entity';
import { Driver } from '../../modules/drivers/entities/driver.entity';
import { Language } from '../../modules/languages/entities/language.entity';
import { CryptoService } from '../../modules/security/crypto.service';
import { PasswordService } from '../../modules/security/password.service';
import { AccountRole, DriverType, RecordStatus } from '../../common/enums';

interface LanguageSeed {
  id: string;
  name: string;
}

interface DriverSeed {
  id: string;
  type: DriverType;
  name: string;
  status: RecordStatus;
  secretKey: string | null;
  maxRpm: number;
  maxRpd: number;
}

interface AccountSeed {
  fullName: string;
  email: string;
  password: string;
  role: AccountRole;
  maxRpm: number;
  maxRpd: number;
  callbackUrl: string;
}

const LANGUAGES: LanguageSeed[] = [
  { id: 'id', name: 'Bahasa Indonesia' },
  { id: 'en', name: 'English' },
];

const DRIVERS: DriverSeed[] = [
  {
    id: 'gemini-3.8-flash',
    type: DriverType.AI,
    name: 'Gemini Flash',
    status: RecordStatus.ACTIVE,
    secretKey: null,
    maxRpm: 10,
    maxRpd: 250,
  },
  {
    id: 'api-google-translate',
    type: DriverType.API,
    name: 'Google Translate',
    status: RecordStatus.INACTIVE,
    secretKey: null,
    maxRpm: 100,
    maxRpd: 10_000,
  },
];

const ACCOUNTS: AccountSeed[] = [
  {
    fullName: 'Admin',
    email: 'halo.trisnasejati@gmail.com',
    password: 'admin123',
    role: AccountRole.ADMIN,
    maxRpm: 0,
    maxRpd: 0,
    callbackUrl: 'http://localhost:4000/callback',
  },
  {
    fullName: 'Client',
    email: 'devs.trisnasejati@gmail.com',
    password: 'client123',
    role: AccountRole.CLIENT,
    maxRpm: 0,
    maxRpd: 0,
    callbackUrl: 'http://localhost:4000/callback',
  },
];

/**
 * Idempotent database seeder: creates the languages, drivers, accounts, driver
 * assignments and API keys required to use the translator right away.
 *
 * Run it with `npm run seed`.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Language)
    private readonly languagesRepository: Repository<Language>,
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
    @InjectRepository(AccountDriver)
    private readonly accountDriversRepository: Repository<AccountDriver>,
    @InjectRepository(AccountKey)
    private readonly accountKeysRepository: Repository<AccountKey>,
    private readonly cryptoService: CryptoService,
    private readonly passwordService: PasswordService,
  ) {}

  async run(): Promise<void> {
    this.logger.log('Seeding languages...');
    await this.seedLanguages();

    this.logger.log('Seeding drivers...');
    await this.seedDrivers();

    this.logger.log('Seeding accounts...');
    const accounts = await this.seedAccounts();

    this.logger.log('Seeding account drivers...');
    await this.seedAccountDrivers(accounts);

    this.logger.log('Seeding account keys...');
    await this.seedAccountKeys(accounts);

    this.logger.log('Seeding finished');
  }

  private async seedLanguages(): Promise<void> {
    for (const language of LANGUAGES) {
      const existing = await this.languagesRepository.findOne({
        where: { id: language.id },
      });

      if (existing) {
        this.logger.log(`Language "${language.id}" already exists, skipping`);

        continue;
      }

      await this.languagesRepository.insert({
        id: language.id,
        name: language.name,
        status: RecordStatus.ACTIVE,
      });
      this.logger.log(`Language "${language.id}" (${language.name}) created`);
    }
  }

  private async seedDrivers(): Promise<void> {
    for (const seed of DRIVERS) {
      const existing = await this.driversRepository.findOne({
        where: { id: seed.id },
      });

      if (existing) {
        this.logger.log(`Driver "${seed.id}" already exists, skipping`);

        continue;
      }

      await this.driversRepository.insert({
        id: seed.id,
        type: seed.type,
        name: seed.name,
        status: seed.status,
        secretKey: seed.secretKey
          ? this.cryptoService.encrypt(seed.secretKey)
          : null,
        maxRpm: seed.maxRpm,
        maxRpd: seed.maxRpd,
      });
      this.logger.log(`Driver "${seed.id}" (${seed.name}) created`);
    }
  }

  private async seedAccounts(): Promise<
    Array<{ seed: AccountSeed; account: Account }>
  > {
    const result: Array<{ seed: AccountSeed; account: Account }> = [];

    for (const seed of ACCOUNTS) {
      const existing = await this.accountsRepository.findOne({
        where: { email: seed.email },
      });

      if (existing) {
        this.logger.log(`Account "${seed.email}" already exists, skipping`);
        result.push({ seed, account: existing });

        continue;
      }

      const account: Account = {
        id: uuidv7(),
        fullName: seed.fullName,
        email: seed.email,
        password: await this.passwordService.hash(seed.password),
        role: seed.role,
        status: RecordStatus.ACTIVE,
        maxRpm: seed.maxRpm,
        maxRpd: seed.maxRpd,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.accountsRepository.insert(account);
      this.logger.log(
        `Account "${seed.email}" (${seed.role}) created with password "${seed.password}"`,
      );
      result.push({ seed, account });
    }

    return result;
  }

  private async seedAccountDrivers(
    accounts: Array<{ seed: AccountSeed; account: Account }>,
  ): Promise<void> {
    for (const { account } of accounts) {
      for (const driver of DRIVERS) {
        const existing = await this.accountDriversRepository.findOne({
          where: { accountId: account.id, driverId: driver.id },
        });

        if (existing) {
          continue;
        }

        await this.accountDriversRepository.insert({
          id: uuidv7(),
          accountId: account.id,
          driverId: driver.id,
          createdAt: new Date(),
        });
        this.logger.log(
          `Driver "${driver.id}" granted to account "${account.email}"`,
        );
      }
    }
  }

  private async seedAccountKeys(
    accounts: Array<{ seed: AccountSeed; account: Account }>,
  ): Promise<void> {
    for (const { seed, account } of accounts) {
      const existing = await this.accountKeysRepository.findOne({
        where: { accountId: account.id },
      });

      if (existing) {
        this.logger.log(
          `Account "${seed.email}" already has an API key, skipping`,
        );

        continue;
      }

      const secretKey = `sk_translator_${randomBytes(24).toString('hex')}`;
      const keyId = uuidv7();

      await this.accountKeysRepository.insert({
        id: keyId,
        accountId: account.id,
        secretKey: this.cryptoService.encrypt(secretKey),
        callbackUrl: seed.callbackUrl,
        createdAt: new Date(),
      });

      this.logger.warn(
        `API key created for "${seed.email}" -> key_id: ${keyId} | secret_key: ${secretKey} (store it now, it will never be shown again)`,
      );
    }
  }
}

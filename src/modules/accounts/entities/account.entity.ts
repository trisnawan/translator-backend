import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountRole, RecordStatus } from '../../../common/enums';
import { uuidBinaryTransformer } from '../../../common/utils/uuid.util';
import { AccountDriver } from '../../account-drivers/entities/account-driver.entity';
import { AccountKey } from '../../account-keys/entities/account-key.entity';

/** Application account, either an `admin` or a `client` (`accounts`). */
@Entity('accounts')
export class Account {
  /** UUIDv7 stored as `binary(16)`. */
  @PrimaryColumn({
    type: 'binary',
    length: 16,
    transformer: uuidBinaryTransformer,
  })
  id!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 100 })
  fullName!: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  email!: string;

  /** bcrypt hash, excluded from every query unless explicitly selected. */
  @Column({ type: 'varchar', length: 255, select: false })
  password!: string;

  @Column({ type: 'enum', enum: AccountRole, default: AccountRole.CLIENT })
  role!: AccountRole;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status!: RecordStatus;

  /** Maximum number of API requests per minute, `0` means unlimited. */
  @Column({ name: 'max_rpm', type: 'int', default: 0 })
  maxRpm!: number;

  /** Maximum number of API requests per day, `0` means unlimited. */
  @Column({ name: 'max_rpd', type: 'int', default: 0 })
  maxRpd!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', precision: 6 })
  updatedAt!: Date;

  @OneToMany(() => AccountDriver, (accountDriver) => accountDriver.account)
  accountDrivers?: AccountDriver[];

  @OneToMany(() => AccountKey, (accountKey) => accountKey.account)
  accountKeys?: AccountKey[];
}

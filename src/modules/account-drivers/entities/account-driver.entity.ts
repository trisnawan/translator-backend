import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { uuidBinaryTransformer } from '../../../common/utils/uuid.util';
import { Account } from '../../accounts/entities/account.entity';
import { Driver } from '../../drivers/entities/driver.entity';

/** Which driver an account is allowed to use through `POST /translate`. */
@Entity('account_drivers')
export class AccountDriver {
  @PrimaryColumn({
    type: 'binary',
    length: 16,
    transformer: uuidBinaryTransformer,
  })
  id!: string;

  @Column({
    name: 'account_id',
    type: 'binary',
    length: 16,
    transformer: uuidBinaryTransformer,
  })
  accountId!: string;

  @Column({ name: 'driver_id', type: 'varchar', length: 20 })
  driverId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => Account, (account) => account.accountDrivers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'account_id' })
  account?: Account;

  @ManyToOne(() => Driver, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'driver_id' })
  driver?: Driver;
}

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

/**
 * API credentials of an account (`account_keys`).
 *
 * The `id` of this row is the `key_id` that clients send in the request header,
 * `secret_key` is the HMAC/JWT secret shared between the client and the
 * translator and `callback_url` is where the translation result is delivered.
 */
@Entity('account_keys')
export class AccountKey {
  /** Value sent as the `key_id` header. */
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

  /** Encrypted secret key. Excluded from every query unless explicitly selected. */
  @Column({ name: 'secret_key', type: 'text', select: false, nullable: true })
  secretKey!: string | null;

  /** Destination of the translated content, `null` means the client only polls `/histories`. */
  @Column({
    name: 'callback_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  callbackUrl!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => Account, (account) => account.accountKeys, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'account_id' })
  account?: Account;
}

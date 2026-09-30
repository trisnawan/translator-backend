import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { CallbackStatus, HistoryStatus } from '../../../common/enums';
import { uuidBinaryTransformer } from '../../../common/utils/uuid.util';
import { Account } from '../../accounts/entities/account.entity';
import { Driver } from '../../drivers/entities/driver.entity';

/** One translation job, from the API request until the callback is delivered. */
@Entity('histories')
export class History {
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

  @Column({ name: 'translate_from', type: 'char', length: 2 })
  translateFrom!: string;

  @Column({ name: 'translate_to', type: 'char', length: 2 })
  translateTo!: string;

  /** Identifier owned by the client, echoed back on the callback. */
  @Column({ name: 'reference_id', type: 'varchar', length: 100 })
  referenceId!: string;

  /** Original content. */
  @Column({ name: 'reference_content', type: 'text' })
  referenceContent!: string;

  /** Result of the translation, `null` while the job is still queued. */
  @Column({ name: 'translated_content', type: 'text', nullable: true })
  translatedContent!: string | null;

  @Column({
    type: 'enum',
    enum: HistoryStatus,
    default: HistoryStatus.REQUESTED,
  })
  status!: HistoryStatus;

  /** When the API request was accepted. */
  @Column({
    name: 'requested_at',
    type: 'timestamp',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  requestedAt!: Date;

  /** When the translation finished (successfully or not). */
  @Column({
    name: 'translated_at',
    type: 'timestamp',
    precision: 6,
    nullable: true,
  })
  translatedAt!: Date | null;

  @Column({
    name: 'callback_status',
    type: 'enum',
    enum: CallbackStatus,
    default: CallbackStatus.OPEN,
  })
  callbackStatus!: CallbackStatus;

  /** Number of callback delivery attempts already performed. */
  @Column({ name: 'callback_retry', type: 'int', default: 0 })
  callbackRetry!: number;

  /** When the callback was delivered successfully. */
  @Column({
    name: 'callback_at',
    type: 'timestamp',
    precision: 6,
    nullable: true,
  })
  callbackAt!: Date | null;

  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: Account;

  @ManyToOne(() => Driver, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'driver_id' })
  driver?: Driver;
}

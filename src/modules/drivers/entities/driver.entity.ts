import { Column, Entity, PrimaryColumn } from 'typeorm';
import { DriverType, RecordStatus } from '../../../common/enums';

/**
 * Master data of the available translator drivers (`drivers`).
 *
 * `secret_key` holds the **encrypted** credential of the provider
 * (API key / service account) and is never returned by the API.
 */
@Entity('drivers')
export class Driver {
  /** Driver identifier, also used to resolve the provider engine, e.g. `gemini-3.8-flash`. */
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id!: string;

  @Column({ type: 'enum', enum: DriverType })
  type!: DriverType;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status!: RecordStatus;

  /** Encrypted provider credential. Excluded from every query unless explicitly selected. */
  @Column({ name: 'secret_key', type: 'text', select: false, nullable: true })
  secretKey!: string | null;

  /** Maximum number of translation tasks per minute, `0` means unlimited. */
  @Column({ name: 'max_rpm', type: 'int', default: 0 })
  maxRpm!: number;

  /** Maximum number of translation tasks per day, `0` means unlimited. */
  @Column({ name: 'max_rpd', type: 'int', default: 0 })
  maxRpd!: number;
}

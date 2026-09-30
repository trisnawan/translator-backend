import { Column, Entity, PrimaryColumn } from 'typeorm';
import { RecordStatus } from '../../../common/enums';

/** Master data of every language supported by the translator (`languages`). */
@Entity('languages')
export class Language {
  /** ISO 639-1 language code, e.g. `en`, `id`. */
  @PrimaryColumn({ type: 'char', length: 2 })
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'enum', enum: RecordStatus, default: RecordStatus.ACTIVE })
  status!: RecordStatus;
}

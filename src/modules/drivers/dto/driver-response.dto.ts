import { DriverType, RecordStatus } from '../../../common/enums';

/** Public representation of a driver, `secret_key` is never returned. */
export interface DriverResponse {
  id: string;
  type: DriverType;
  name: string;
  status: RecordStatus;
  max_rpm: number;
  max_rpd: number;
  /** `true` when a credential is stored for this driver. */
  has_secret_key: boolean;
  /** Engine that will execute this driver, `null` when the id prefix is unknown. */
  engine: string | null;
}

import { AccountRole, RecordStatus } from '../../../common/enums';

/** Public representation of an account (the password hash is never returned). */
export interface AccountResponse {
  id: string;
  full_name: string;
  email: string;
  role: AccountRole;
  status: RecordStatus;
  max_rpm: number;
  max_rpd: number;
  created_at: Date;
  updated_at: Date;
}

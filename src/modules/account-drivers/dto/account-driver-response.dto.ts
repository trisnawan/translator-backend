import { DriverType } from '../../../common/enums';

/** Account summary embedded in the `account_drivers` responses. */
export interface AccountDriverAccountSummary {
  id: string;
  full_name: string;
  email: string;
}

/** Driver summary embedded in the `account_drivers` responses. */
export interface AccountDriverDriverSummary {
  id: string;
  name: string;
  type: DriverType;
  status: string;
}

export interface AccountDriverResponse {
  id: string;
  account_id: string;
  account: AccountDriverAccountSummary | null;
  driver_id: string;
  driver: AccountDriverDriverSummary | null;
  created_at: Date;
}

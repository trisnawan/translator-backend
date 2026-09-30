import { AccountRole, RecordStatus } from '../../../common/enums';

/** Result of `POST /auth/login` and `GET /access-token`. */
export interface AccessTokenResponse {
  token_type: 'Bearer';
  access_token: string;
  /** Lifetime of the token in seconds. */
  expires_in: number;
  expires_at: string;
  account: {
    id: string;
    full_name: string;
    email: string;
    role: AccountRole;
    status: RecordStatus;
    max_rpm: number;
    max_rpd: number;
  };
}

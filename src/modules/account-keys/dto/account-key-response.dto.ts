import { AccountDriverAccountSummary } from '../../account-drivers/dto/account-driver-response.dto';

/** Public representation of an account key. */
export interface AccountKeyResponse {
  /** The value to send in the `key_id` header. */
  id: string;
  account_id: string;
  account: AccountDriverAccountSummary | null;
  callback_url: string | null;
  /** Masked secret, the plaintext is never returned (except once, on insert). */
  secret_key_masked: string | null;
  has_secret_key: boolean;
  created_at: Date;
}

/** Response of `POST /account-keys/insert`, the only time the plaintext is returned. */
export interface AccountKeyCreatedResponse extends AccountKeyResponse {
  secret_key: string;
}

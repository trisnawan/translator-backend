import { AccountRole, RecordStatus } from '../enums';

/** Shape of the account attached to `request.user` by the JWT guard. */
export interface AuthenticatedAccount {
  id: string;
  fullName: string;
  email: string;
  role: AccountRole;
  status: RecordStatus;
  maxRpm: number;
  maxRpd: number;
}

/** Shape of the account key attached to `request.translate` by the signature guard. */
export interface TranslateIdentity {
  accountId: string;
  keyId: string;
  referenceId: string;
  callbackUrl: string | null;
}

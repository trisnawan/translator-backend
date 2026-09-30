import { CallbackStatus, HistoryStatus } from '../../../common/enums';
import {
  AccountDriverAccountSummary,
  AccountDriverDriverSummary,
} from '../../account-drivers/dto/account-driver-response.dto';

/** Public representation of a translation job. */
export interface HistoryResponse {
  id: string;
  account_id: string;
  account: AccountDriverAccountSummary | null;
  driver_id: string;
  driver: AccountDriverDriverSummary | null;
  translate_from: string;
  translate_to: string;
  reference_id: string;
  reference_content: string;
  translated_content: string | null;
  status: HistoryStatus;
  requested_at: Date;
  translated_at: Date | null;
  callback_status: CallbackStatus;
  callback_retry: number;
  callback_at: Date | null;
}

import { HistoryStatus } from '../../../common/enums';

/** Response of `POST /translate` (HTTP 200, the job is processed asynchronously). */
export interface TranslateAcceptedResponse {
  /** `histories.id`, use it to poll `/histories/detail/{id}`. */
  history_id: string;
  reference_id: string;
  driver_id: string;
  translate_from: string;
  translate_to: string;
  status: HistoryStatus;
  requested_at: string;
  /** `false` when the callback URL of the key is empty (poll `/histories` instead). */
  callback_enabled: boolean;
}

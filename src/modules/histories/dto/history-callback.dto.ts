import { HistoryStatus } from '../../../common/enums';

/**
 * Body posted by the translator to the `callback_url` of the account key.
 *
 * The request carries the `key_id` header and an `Authorization: Bearer <jwt>`
 * signed with the account key secret, where the JWT payload contains
 * `account_id` and `reference_id` (same value as in this body).
 */
export interface HistoryCallbackPayload {
  status: HistoryStatus;
  translate_from: string;
  translate_to: string;
  reference_id: string;
  translated_content: string | null;
  translated_at: string | null;
}

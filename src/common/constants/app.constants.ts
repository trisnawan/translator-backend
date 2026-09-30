import {
  AccountRole,
  CallbackStatus,
  DriverType,
  HistoryStatus,
  RecordStatus,
} from '../enums';

/** Useful when building enum columns / DTO whitelists. */
export const RECORD_STATUS_VALUES = Object.values(RecordStatus);
export const ACCOUNT_ROLE_VALUES = Object.values(AccountRole);
export const DRIVER_TYPE_VALUES = Object.values(DriverType);
export const HISTORY_STATUS_VALUES = Object.values(HistoryStatus);
export const CALLBACK_STATUS_VALUES = Object.values(CallbackStatus);

/** `max_rpm` / `max_rpd` value that disables the limit. */
export const UNLIMITED = 0;

/** Human readable default message used by the response envelope. */
export const DEFAULT_SUCCESS_MESSAGE = 'Success';

/** Generic record status used by the master data tables. */
export enum RecordStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/** Kind of translator driver. */
export enum DriverType {
  AI = 'ai',
  API = 'api',
}

/** Application role of an account. */
export enum AccountRole {
  ADMIN = 'admin',
  CLIENT = 'client',
}

/** Lifecycle of a translation job. */
export enum HistoryStatus {
  REQUESTED = 'requested',
  TRANSLATED = 'translated',
  FAILED = 'failed',
}

/** Lifecycle of the callback delivery of a translation job. */
export enum CallbackStatus {
  OPEN = 'open',
  CLOSE = 'close',
}

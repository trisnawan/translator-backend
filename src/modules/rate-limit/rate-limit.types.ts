export interface RateLimitWindow {
  /** Requests performed in the last 60 seconds. */
  rpm: number;
  /** Requests performed since 00:00 UTC. */
  rpd: number;
}

export interface RateLimitQuota {
  /** `0` means unlimited. */
  rpm: number;
  /** `0` means unlimited. */
  rpd: number;
}

export interface RateLimitUsage {
  usage: RateLimitWindow;
  limit: RateLimitQuota;
  /** Instant when the per minute window will be free again. */
  rpmResetAt: Date;
  /** Instant when the per day counter resets. */
  rpdResetAt: Date;
}

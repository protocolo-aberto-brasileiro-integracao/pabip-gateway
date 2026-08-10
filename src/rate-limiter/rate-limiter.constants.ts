export interface RateLimiterQuota {
  points: number;
  duration: number;
}

export const INBOUND_RATE_LIMITER_QUOTA: RateLimiterQuota = {
  points: 300,
  duration: 1,
};

export const OUTBOUND_RATE_LIMITER_QUOTA: RateLimiterQuota = {
  points: 100,
  duration: 1,
};

export const PEERS_ACCESS_RATE_LIMITER_QUOTA: RateLimiterQuota = {
  points: 60,
  duration: 1,
};

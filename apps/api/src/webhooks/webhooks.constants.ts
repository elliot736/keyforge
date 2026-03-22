export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery';

/** Number of consecutive failures before the circuit breaker trips */
export const CIRCUIT_BREAKER_THRESHOLD = 10;

/** Seconds before the circuit breaker resets (allows retrying) */
export const CIRCUIT_BREAKER_RESET_SECONDS = 300;

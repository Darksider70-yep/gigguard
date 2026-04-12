import { logger } from './logger';

export enum CircuitState {
  CLOSED,   // Normal operation
  OPEN,     // Failure detected, rejecting requests
  HALF_OPEN // Testing if service is back
}

export interface CircuitBreakerOptions {
  failureThreshold: number; // Num failures before opening
  resetTimeoutMs: number;  // Time to wait before half-open
  name: string;
}

/**
 * A lightweight circuit breaker to protect backend from cascading failures 
 * in ML or Payment services.
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime?: number;
  private options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  async execute<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - (this.lastFailureTime || 0) > this.options.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        logger.info('CircuitBreaker', `Attempting half-open for ${this.options.name}`);
      } else {
        return fallback;
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      return fallback;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.error('CircuitBreaker', `Circuit ${this.options.name} is now OPEN`, {
        failures: this.failureCount,
      });
    }
  }

  public getState(): string {
    return CircuitState[this.state];
  }
}

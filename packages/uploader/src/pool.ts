/**
 * Concurrency-limited async pool.
 *
 * Lightweight replacement for `p-limit` (≈ 30 lines, no dependency).
 */

export class PromisePool {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = () => {
        this.active += 1;
        task().then(resolve, reject).finally(() => {
          this.active -= 1;
          this.next();
        });
      };
      this.queue.push(execute);
      this.next();
    });
  }

  private next(): void {
    while (this.active < this.limit && this.queue.length > 0) {
      const fn = this.queue.shift();
      fn?.();
    }
  }
}

/**
 * Retry an async operation with exponential backoff.
 */
export async function withRetry<T>(
  task: () => Promise<T>,
  attempts: number,
  baseDelayMs = 500
): Promise<T> {
  let lastError: unknown;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (index === attempts - 1) {
        break;
      }
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** index));
    }
  }
  throw lastError;
}

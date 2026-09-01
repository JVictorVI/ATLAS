interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class SharedCache {
  private readonly entries = new Map<string, CacheEntry>();

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  set(key: string, value: unknown, ttlSeconds: number): void {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds,
    });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}

export class OperationalLogger {
  info(message: string, context: Record<string, unknown> = {}): void {
    console.log(JSON.stringify({ level: "info", message, ...context }));
  }

  error(message: string, error: unknown, context: Record<string, unknown>): void {
    console.error(
      JSON.stringify({
        level: "error",
        message,
        error,
        ...context,
      }),
    );
  }
}

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();

  increment(name: string, labels: Record<string, string>): void {
    const labelKey = Object.entries(labels)
      .map(([key, value]) => `${key}=${value}`)
      .join(",");
    const metricKey = `${name}{${labelKey}}`;
    this.counters.set(metricKey, (this.counters.get(metricKey) ?? 0) + 1);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }
}

export const sharedCache = new SharedCache();
export const logger = new OperationalLogger();
export const metrics = new MetricsRegistry();

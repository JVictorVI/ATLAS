import { DomainEvent } from "./domain";
import { MarketplaceSettings } from "./config";
import { logger } from "./runtime";

export type EventHandler = (event: DomainEvent) => Promise<void>;

export class InMemoryEventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  constructor(private readonly config: MarketplaceSettings) {}

  subscribe(topic: string, handler: EventHandler): void {
    const existing = this.handlers.get(topic) ?? [];
    existing.push(handler);
    this.handlers.set(topic, existing);
  }

  async publish(event: DomainEvent): Promise<void> {
    const subscribers = this.handlers.get(event.topic) ?? [];

    for (const subscriber of subscribers) {
      void this.deliver(subscriber, event);
    }
  }

  private async deliver(handler: EventHandler, event: DomainEvent): Promise<void> {
    for (
      event.retryCount = 0;
      event.retryCount < this.config.messageRetryAttempts;
      event.retryCount += 1
    ) {
      try {
        await handler(event);
        return;
      } catch (error) {
        logger.error("event handler failed", error, { event });
      }
    }
  }
}

import * as vscode from "vscode";

export type WebviewMessagePriority = "high" | "normal" | "low";

export type WebviewMessageOptions = {
  priority?: WebviewMessagePriority;
};

type QueuedWebviewMessage = {
  message: unknown;
  resolve: () => void;
  reject: (error: unknown) => void;
};

type WebviewQueueState = {
  draining: boolean;
  high: QueuedWebviewMessage[];
  normal: QueuedWebviewMessage[];
  low: QueuedWebviewMessage[];
};

export class WebviewMessageQueue {
  private readonly queues = new WeakMap<vscode.Webview, WebviewQueueState>();

  public post(
    webview: vscode.Webview,
    message: unknown,
    options: WebviewMessageOptions = {},
  ): Promise<void> {
    const state = this.getState(webview);
    const priority = options.priority ?? "normal";

    return new Promise((resolve, reject) => {
      state[priority].push({ message, resolve, reject });
      this.drain(webview, state);
    });
  }

  private getState(webview: vscode.Webview): WebviewQueueState {
    let state = this.queues.get(webview);

    if (!state) {
      state = {
        draining: false,
        high: [],
        normal: [],
        low: [],
      };
      this.queues.set(webview, state);
    }

    return state;
  }

  private drain(webview: vscode.Webview, state: WebviewQueueState): void {
    if (state.draining) {
      return;
    }

    state.draining = true;

    void this.drainLoop(webview, state);
  }

  private async drainLoop(
    webview: vscode.Webview,
    state: WebviewQueueState,
  ): Promise<void> {
    try {
      let processedMessages = 0;
      let next = this.nextMessage(state);

      while (next) {
        try {
          await webview.postMessage(next.message);
          next.resolve();
        } catch (error) {
          next.reject(error);
        }

        processedMessages += 1;

        if (processedMessages % 25 === 0) {
          await this.yieldToEventLoop();
        }

        next = this.nextMessage(state);
      }
    } finally {
      state.draining = false;

      if (this.hasQueuedMessages(state)) {
        this.drain(webview, state);
      }
    }
  }

  private nextMessage(
    state: WebviewQueueState,
  ): QueuedWebviewMessage | undefined {
    return state.high.shift() ?? state.normal.shift() ?? state.low.shift();
  }

  private hasQueuedMessages(state: WebviewQueueState): boolean {
    return Boolean(state.high.length || state.normal.length || state.low.length);
  }

  private async yieldToEventLoop(): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

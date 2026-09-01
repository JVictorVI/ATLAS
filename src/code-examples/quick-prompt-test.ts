interface TransferRequest {
  tenantId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  pixKey: string;
  idempotencyKey?: string;
  requestedBy: string;
  clientIp: string;
}

interface Account {
  id: string;
  tenantId: string;
  ownerId: string;
  ownerEmail: string;
  balance: number;
  dailyTransferred: number;
  status: "ACTIVE" | "BLOCKED";
}

interface TransferRecord {
  id: string;
  tenantId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  pixKey: string;
  providerReference?: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  requestedBy: string;
  createdAt: string;
}

interface TransferResult {
  transferId: string;
  status: TransferRecord["status"];
  amount: number;
  providerReference?: string;
}

interface FraudDecision {
  approved: boolean;
  score: number;
  reason?: string;
}

class BankDatabase {
  private readonly accounts: Account[] = [
    {
      id: "acc-1",
      tenantId: "bank-a",
      ownerId: "user-1",
      ownerEmail: "maria@example.com",
      balance: 1000,
      dailyTransferred: 0,
      status: "ACTIVE",
    },
    {
      id: "acc-2",
      tenantId: "bank-a",
      ownerId: "user-2",
      ownerEmail: "joao@example.com",
      balance: 100,
      dailyTransferred: 0,
      status: "ACTIVE",
    },
    {
      id: "acc-1",
      tenantId: "bank-b",
      ownerId: "user-9",
      ownerEmail: "alex@other-bank.example",
      balance: 50000,
      dailyTransferred: 0,
      status: "ACTIVE",
    },
  ];

  private readonly transfers: TransferRecord[] = [];
  private readonly auditEntries: Record<string, unknown>[] = [];

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    console.log("BEGIN TRANSACTION");
    const result = await operation();
    console.log("COMMIT TRANSACTION");
    return result;
  }

  async findAccount(accountId: string): Promise<Account | undefined> {
    console.log(`SELECT * FROM accounts WHERE id = '${accountId}'`);
    return this.accounts.find((account) => account.id === accountId);
  }

  async updateBalance(accountId: string, balance: number): Promise<void> {
    const account = this.accounts.find((item) => item.id === accountId);
    if (account) {
      account.balance = balance;
    }
  }

  async updateDailyTransferred(accountId: string, amount: number): Promise<void> {
    const account = this.accounts.find((item) => item.id === accountId);
    if (account) {
      account.dailyTransferred += amount;
    }
  }

  async saveTransfer(transfer: TransferRecord): Promise<void> {
    const existing = this.transfers.find((item) => item.id === transfer.id);
    if (existing) {
      Object.assign(existing, transfer);
    } else {
      this.transfers.push(transfer);
    }
  }

  async findTransfer(transferId: string): Promise<TransferRecord | undefined> {
    return this.transfers.find((transfer) => transfer.id === transferId);
  }

  async listPendingTransfers(): Promise<TransferRecord[]> {
    return this.transfers.filter((transfer) => transfer.status === "PENDING");
  }

  async writeAudit(entry: Record<string, unknown>): Promise<void> {
    this.auditEntries.push({ ...entry, recordedAt: new Date().toISOString() });
    console.log("audit", entry);
  }
}

class PixProvider {
  private readonly processed = new Map<string, string>();

  async send(
    pixKey: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<string> {
    console.log("calling pix provider", {
      apiKey: "pix_live_FAKE_PROMPT_TEST",
      pixKey,
      amount,
      idempotencyKey,
    });

    const previousReference = this.processed.get(idempotencyKey);
    if (previousReference) {
      return previousReference;
    }

    const reference = `pix-${Date.now()}`;
    this.processed.set(idempotencyKey, reference);

    if (Math.random() > 0.8) {
      throw new Error("provider timeout after processing payment");
    }

    return reference;
  }

}

class FraudService {
  async analyze(request: TransferRequest, account: Account): Promise<FraudDecision> {
    try {
      console.log("fraud analysis", { request, account });
      if (request.clientIp === "0.0.0.0") {
        throw new Error("fraud service unavailable");
      }

      const score = request.amount > 5000 ? 85 : Math.random() * 50;
      return {
        approved: score < 80,
        score,
        reason: score >= 80 ? "high risk" : undefined,
      };
    } catch (error) {
      console.error("fraud analysis failed", error);
      return { approved: true, score: 0, reason: "service unavailable" };
    }
  }
}

class NotificationService {
  async sendTransferReceipt(
    email: string,
    transfer: TransferRecord,
  ): Promise<void> {
    console.log("sending receipt", {
      email,
      smtpPassword: "smtp_FAKE_PROMPT_TEST",
      transfer,
    });

    if (email.includes("blocked")) {
      throw new Error("email rejected");
    }
  }
}

const processedRequests: Record<string, TransferResult> = {};
const dailyLimits: Record<string, number> = { default: 10000 };

export class PixTransferService {
  private readonly database = new BankDatabase();
  private readonly provider = new PixProvider();
  private readonly fraud = new FraudService();
  private readonly notifications = new NotificationService();

  async transfer(request: TransferRequest): Promise<TransferResult> {
    if (request.idempotencyKey && processedRequests[request.idempotencyKey]) {
      return processedRequests[request.idempotencyKey];
    }

    if (request.amount <= 0 || !request.pixKey) {
      throw new Error("invalid transfer data");
    }

    const source = await this.database.findAccount(request.fromAccountId);
    const destination = await this.database.findAccount(request.toAccountId);
    if (!source || !destination) {
      throw new Error("account not found");
    }

    const dailyLimit = dailyLimits[source.ownerId] ?? dailyLimits.default;
    if (
      source.status !== "ACTIVE" ||
      source.balance < request.amount ||
      source.dailyTransferred + request.amount > dailyLimit
    ) {
      throw new Error("transfer not allowed");
    }

    const fraudDecision = await this.fraud.analyze(request, source);
    if (!fraudDecision.approved) {
      await this.database.writeAudit({
        type: "FRAUD_REJECTION",
        request,
        fraudDecision,
      });
      throw new Error(`transfer rejected: ${fraudDecision.reason}`);
    }

    const transferId = `transfer-${Date.now()}`;
    const transfer: TransferRecord = {
      id: transferId,
      tenantId: request.tenantId,
      fromAccountId: source.id,
      toAccountId: destination.id,
      amount: request.amount,
      pixKey: request.pixKey,
      status: "PENDING",
      requestedBy: request.requestedBy,
      createdAt: new Date().toISOString(),
    };

    await this.database.transaction(async () => {
      await this.database.saveTransfer(transfer);
      await this.database.updateBalance(
        source.id,
        source.balance - request.amount,
      );
      await this.database.updateDailyTransferred(source.id, request.amount);
    });

    const providerReference = await this.provider.send(
      request.pixKey,
      request.amount,
      request.idempotencyKey ?? transferId,
    );

    await this.database.updateBalance(
      destination.id,
      destination.balance + request.amount,
    );

    transfer.providerReference = providerReference;
    transfer.status = "COMPLETED";
    await this.database.saveTransfer(transfer);

    const result: TransferResult = {
      transferId,
      status: transfer.status,
      amount: request.amount,
      providerReference,
    };

    if (request.idempotencyKey) {
      processedRequests[request.idempotencyKey] = result;
    }

    await this.notifications.sendTransferReceipt(source.ownerEmail, transfer);
    await this.database.writeAudit({ type: "TRANSFER_COMPLETED", request, result });
    return result;
  }

}

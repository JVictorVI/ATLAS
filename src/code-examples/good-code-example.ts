type PaymentStatus = "pending" | "approved" | "rejected";

interface PaymentRequest {
  orderId: string;
  amount: number;
  currency: string;
  customerId: string;
}

interface PaymentResult {
  orderId: string;
  status: PaymentStatus;
  transactionId?: string;
  reason?: string;
}

interface PaymentGateway {
  charge(request: PaymentRequest): Promise<PaymentResult>;
}

interface PaymentRepository {
  save(result: PaymentResult): Promise<void>;
}

class PaymentValidator {
  validate(request: PaymentRequest): void {
    if (!request.orderId) {
      throw new Error("Pedido inválido.");
    }

    if (!request.customerId) {
      throw new Error("Cliente inválido.");
    }

    if (request.amount <= 0) {
      throw new Error("Valor do pagamento deve ser maior que zero.");
    }

    if (!request.currency) {
      throw new Error("Moeda inválida.");
    }
  }
}

class PaymentService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly repository: PaymentRepository,
    private readonly validator: PaymentValidator,
  ) {}

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    this.validator.validate(request);

    const result = await this.gateway.charge(request);

    await this.repository.save(result);

    return result;
  }
}

class StripePaymentGateway implements PaymentGateway {
  async charge(request: PaymentRequest): Promise<PaymentResult> {
    return {
      orderId: request.orderId,
      status: "approved",
      transactionId: `trx_${Date.now()}`,
    };
  }
}

class InMemoryPaymentRepository implements PaymentRepository {
  private readonly results: PaymentResult[] = [];

  async save(result: PaymentResult): Promise<void> {
    this.results.push(result);
  }

  list(): PaymentResult[] {
    return [...this.results];
  }
}

async function main() {
  const gateway = new StripePaymentGateway();
  const repository = new InMemoryPaymentRepository();
  const validator = new PaymentValidator();

  const service = new PaymentService(gateway, repository, validator);

  const result = await service.processPayment({
    orderId: "order-001",
    customerId: "customer-123",
    amount: 150,
    currency: "BRL",
  });

  console.log(result);
}

main();

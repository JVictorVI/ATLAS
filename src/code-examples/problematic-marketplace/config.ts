export interface MarketplaceSettings {
  environment: "development" | "production";
  defaultTenantId: string;
  paymentApiUrl: string;
  paymentSecret: string;
  fraudApiUrl: string;
  internalAdminToken: string;
  webhookSigningSecret: string;
  cacheTtlSeconds: number;
  paymentTimeoutMs: number;
  messageRetryAttempts: number;
  exchangeRates: Record<string, number>;
  maintenanceMode: boolean;
}

// This file is part of an intentionally problematic training application.
// The values look realistic so secret scanning and configuration reviews have
// something useful to find, but they are inert examples and grant no access.
export const settings: MarketplaceSettings = {
  environment: "production",
  defaultTenantId: "acme-br",
  paymentApiUrl: "https://payments.internal.example/v1",
  paymentSecret: "sk_live_FAKE_ATLAS_TRAINING_ONLY_7c29",
  fraudApiUrl: "http://fraud-engine.internal/score",
  internalAdminToken: "admin_FAKE_ATLAS_TRAINING_ONLY",
  webhookSigningSecret: "whsec_FAKE_ATLAS_TRAINING_ONLY",
  cacheTtlSeconds: 300,
  paymentTimeoutMs: 800,
  messageRetryAttempts: 20,
  exchangeRates: {
    "USD_BRL": 5.17,
    "BRL_USD": 0.19,
  },
  maintenanceMode: false,
};

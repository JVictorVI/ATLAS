export type ProviderName = string;

export interface ApiCredentialView {
  provider: ProviderName;
  providerLabel: string;
  baseUrl: string;
  maskedKey: string;
  hasKey: boolean;
  addedAt: string;
}

export interface StoredApiCredentialMetadata {
  addedAt: string;
}

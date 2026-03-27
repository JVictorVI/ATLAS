import * as vscode from "vscode";
import { SecretStorageService } from "../services/SecretStorageService";

export type ProviderName = "OpenAI" | "OpenRouter" | "Groq";

interface ProviderConfig {
  id: ProviderName;
  label: string;
  baseUrl: string;
  apiKeyPlaceholder: string;
}

export interface ApiCredentialView {
  provider: ProviderName;
  providerLabel: string;
  baseUrl: string;
  maskedKey: string;
  hasKey: boolean;
  addedAt: string;
}

interface StoredApiCredentialMetadata {
  addedAt: string;
}

export class ApiKeyManager {
  private readonly providers: ProviderConfig[] = [
    {
      id: "OpenAI",
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKeyPlaceholder: "sk-...",
    },
    {
      id: "OpenRouter",
      label: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKeyPlaceholder: "sk-or-v1-...",
    },
    {
      id: "Groq",
      label: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKeyPlaceholder: "gsk_...",
    },
  ];

  constructor(private readonly secretStorage: SecretStorageService) {}

  async handleMessage(data: any, webview: vscode.Webview): Promise<boolean> {
    if (data.type === "adicionarChave") {
      await this.addKey(webview);
      return true;
    }

    if (data.type === "listarChaves") {
      await this.sendCredentialsToWebview(webview);
      return true;
    }

    if (data.type === "excluirChave") {
      await this.deleteKey(data.provider, webview);
      return true;
    }

    return false;
  }

  async addKey(webview: vscode.Webview): Promise<void> {
    const provider = await vscode.window.showQuickPick(
      this.providers.map((item) => ({
        label: item.label,
        description: item.baseUrl,
        providerId: item.id,
      })),
      {
        title: "Selecionar provedor",
        placeHolder: "Escolha o provedor da chave",
        ignoreFocusOut: true,
      },
    );

    if (!provider) {
      return;
    }

    const selectedProvider = this.getProviderConfig(provider.providerId);

    if (!selectedProvider) {
      vscode.window.showErrorMessage("Provedor inválido.");
      return;
    }

    const apiKey = await vscode.window.showInputBox({
      title: "Adicionar chave de API",
      prompt: `Digite a chave para ${selectedProvider.label}`,
      placeHolder: selectedProvider.apiKeyPlaceholder,
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        const normalized = value.trim();

        if (!normalized) {
          return "A chave não pode ficar vazia.";
        }

        if (normalized.length < 10) {
          return "A chave parece curta demais.";
        }

        return undefined;
      },
    });

    if (!apiKey) {
      return;
    }

    const confirm = await vscode.window.showInformationMessage(
      `Deseja salvar a chave do provedor ${selectedProvider.label}?`,
      { modal: true },
      "Salvar",
    );

    if (confirm !== "Salvar") {
      return;
    }

    const secretKey = this.buildSecretStorageKey(selectedProvider.id);
    const metadataKey = this.buildMetadataStorageKey(selectedProvider.id);

    await this.secretStorage.store(secretKey, apiKey.trim());

    const existingMetadata = await this.getCredentialMetadata(
      selectedProvider.id,
    );

    const metadata: StoredApiCredentialMetadata = {
      addedAt: existingMetadata?.addedAt ?? new Date().toISOString(),
    };

    await this.secretStorage.store(metadataKey, JSON.stringify(metadata));

    vscode.window.showInformationMessage(
      `Chave do provedor ${selectedProvider.label} salva com sucesso.`,
    );

    await this.sendCredentialsToWebview(webview);
  }

  async deleteKey(
    provider: ProviderName,
    webview: vscode.Webview,
  ): Promise<void> {
    if (!provider) {
      return;
    }

    const providerConfig = this.getProviderConfig(provider);

    if (!providerConfig) {
      vscode.window.showErrorMessage("Provedor inválido.");
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Deseja excluir a chave do provedor ${providerConfig.label}?`,
      { modal: true },
      "Excluir",
    );

    if (confirm !== "Excluir") {
      return;
    }

    const secretKey = this.buildSecretStorageKey(provider);
    const metadataKey = this.buildMetadataStorageKey(provider);

    await this.secretStorage.delete(secretKey);
    await this.secretStorage.delete(metadataKey);

    vscode.window.showInformationMessage(
      `Chave do provedor ${providerConfig.label} removida com sucesso.`,
    );

    await this.sendCredentialsToWebview(webview);
  }

  async listCredentials(): Promise<ApiCredentialView[]> {
    const result: ApiCredentialView[] = [];

    for (const provider of this.providers) {
      const secretKey = this.buildSecretStorageKey(provider.id);
      const storedValue = await this.secretStorage.get(secretKey);

      if (!storedValue) {
        continue;
      }

      const metadata = await this.getCredentialMetadata(provider.id);

      result.push({
        provider: provider.id,
        providerLabel: provider.label,
        baseUrl: provider.baseUrl,
        hasKey: true,
        maskedKey: this.maskKey(storedValue),
        addedAt: metadata?.addedAt
          ? this.formatDate(metadata.addedAt)
          : "Não informado",
      });
    }

    return result;
  }

  async sendCredentialsToWebview(webview: vscode.Webview): Promise<void> {
    const credentials = await this.listCredentials();

    await webview.postMessage({
      type: "credenciaisAtualizadas",
      value: credentials,
    });
  }

  getProviderBaseUrl(provider: ProviderName): string | undefined {
    return this.getProviderConfig(provider)?.baseUrl;
  }

  private getProviderConfig(
    provider: ProviderName,
  ): ProviderConfig | undefined {
    return this.providers.find((item) => item.id === provider);
  }

  private async getCredentialMetadata(
    provider: ProviderName,
  ): Promise<StoredApiCredentialMetadata | undefined> {
    const metadataKey = this.buildMetadataStorageKey(provider);
    const rawMetadata = await this.secretStorage.get(metadataKey);

    if (!rawMetadata) {
      return undefined;
    }

    try {
      return JSON.parse(rawMetadata) as StoredApiCredentialMetadata;
    } catch {
      return undefined;
    }
  }

  private buildSecretStorageKey(provider: ProviderName): string {
    return `atlas.apiKey.${provider}`;
  }

  private buildMetadataStorageKey(provider: ProviderName): string {
    return `atlas.apiKeyMetadata.${provider}`;
  }

  private maskKey(value: string): string {
    const normalized = value.trim();

    if (normalized.length <= 8) {
      return "********";
    }

    const start = normalized.slice(0, 4);
    const end = normalized.slice(-4);

    return `${start}...${end}`;
  }

  private formatDate(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Não informado";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  }
}

import * as vscode from "vscode";
import { SecretStorageService } from "../services/SecretStorageService";
import { AtlasConfigManager, ProviderConfig } from "./AtlasConfigManager";
import {
  ApiCredentialView,
  ProviderName,
  StoredApiCredentialMetadata,
} from "../interfaces/ApiKeyTypes";

export class ApiKeyManager {
  constructor(
    private readonly secretStorage: SecretStorageService,
    private readonly configManager: AtlasConfigManager,
  ) {
    this.configManager = configManager;
  }

  private providers: ProviderConfig[] = this.configManager.getAllProviders();

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

    if (data.type === "editarChave") {
      await this.editKey(data.provider, webview);
      return true;
    }

    return false;
  }

  async addKey(webview: vscode.Webview): Promise<void> {
    const provider = await vscode.window.showQuickPick(
      this.getProvidersWithCustomProvider().map((item) => ({
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

    if (provider.providerId === "Provedor Personalizado") {
      const customProviderId = await vscode.window.showInputBox({
        title: "Nome do Provedor Personalizado",
        prompt: "Digite um nome para o provedor personalizado",
        placeHolder: "Nome do provedor",
        ignoreFocusOut: true,
      });

      if (!customProviderId) {
        return;
      }

      provider.providerId = customProviderId as ProviderName;

      const customBaseUrl = await vscode.window.showInputBox({
        title: "URL Base do Provedor Personalizado",
        prompt: "Digite a URL base para o provedor personalizado",
        placeHolder: "Ex: https://api.meuprovedor.com/v1",
        ignoreFocusOut: true,
      });

      if (!customBaseUrl) {
        return;
      }

      const customProvider: ProviderConfig = {
        id: customProviderId as ProviderName,
        label: customProviderId,
        baseUrl: customBaseUrl,
        apiKeyPlaceholder: "Chave de API",
      };

      this.configManager.addProvider(customProvider);
      this.providers = this.configManager.getAllProviders();
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
    this.configManager.removeProvider(provider);
    this.providers = this.configManager.getAllProviders();

    vscode.window.showInformationMessage(
      `Provedor ${providerConfig.label} removido com sucesso.`,
    );

    await this.sendCredentialsToWebview(webview);
  }

  async editKey(
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

    const providerName = await vscode.window.showInputBox({
      title: "Editar provedor",
      prompt: `Digite o nome para ${providerConfig.label}`,
      value: providerConfig.label,
      placeHolder: "Nome do provedor",
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value.trim()) {
          return "O nome do provedor não pode ficar vazio.";
        }
        return undefined;
      },
    });

    if (!providerName) {
      return;
    }

    const providerBaseUrl = await vscode.window.showInputBox({
      title: "Editar URL base do provedor",
      prompt: `Digite a URL base para ${providerConfig.label}`,
      value: providerConfig.baseUrl,
      placeHolder: "Ex: https://api.meuprovedor.com/v1",
      ignoreFocusOut: true,
      validateInput: (value) => {
        const normalized = value.trim();

        if (!normalized) {
          return "A URL base não pode ficar vazia.";
        }

        try {
          new URL(normalized);
          return undefined;
        } catch {
          return "Digite uma URL válida.";
        }
      },
    });

    if (!providerBaseUrl) {
      return;
    }

    const currentKey = await this.getRawKey(provider);

    const editedApiKey = await vscode.window.showInputBox({
      title: "Editar chave de API",
      prompt: `Digite a nova chave para ${providerConfig.label}`,
      placeHolder: providerConfig.apiKeyPlaceholder,
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

    if (!editedApiKey) {
      return;
    }

    const confirm = await vscode.window.showInformationMessage(
      `Deseja salvar as alterações do provedor ${providerConfig.label}?`,
      { modal: true },
      "Salvar",
    );

    if (confirm !== "Salvar") {
      return;
    }

    try {
      const secretKey = this.buildSecretStorageKey(provider);
      const metadataKey = this.buildMetadataStorageKey(provider);

      await this.secretStorage.store(secretKey, editedApiKey.trim());

      const existingMetadata = await this.getCredentialMetadata(provider);

      const metadata: StoredApiCredentialMetadata = {
        addedAt: existingMetadata?.addedAt ?? new Date().toISOString(),
      };

      await this.secretStorage.store(metadataKey, JSON.stringify(metadata));

      this.configManager.updateProvider(provider, {
        label: providerName.trim(),
        baseUrl: providerBaseUrl.trim(),
      });

      this.providers = this.configManager.getAllProviders();

      vscode.window.showInformationMessage(
        `Provedor ${providerName.trim()} editado com sucesso.`,
      );

      await this.sendCredentialsToWebview(webview);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao editar o provedor.";

      vscode.window.showErrorMessage(message);
    }
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

  getProvidersWithCustomProvider(): ProviderConfig[] {
    const filtered = this.providers.filter(
      (p) => p.id !== "Provedor Personalizado",
    );

    return [
      ...filtered,
      {
        id: "Provedor Personalizado",
        label: "Adicionar provedor personalizado",
        baseUrl: "",
        apiKeyPlaceholder: "Chave de API",
      },
    ];
  }

  async getRawKey(provider: ProviderName): Promise<string | undefined> {
    if (!provider) {
      return undefined;
    }

    const secretKey = this.buildSecretStorageKey(provider);
    const storedValue = await this.secretStorage.get(secretKey);

    return storedValue?.trim() || undefined;
  }
}

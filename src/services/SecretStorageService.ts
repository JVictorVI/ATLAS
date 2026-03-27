import * as vscode from "vscode";

export class SecretStorageService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async store(key: string, value: string): Promise<void> {
    await this.context.secrets.store(key, value);
  }

  async get(key: string): Promise<string | undefined> {
    return await this.context.secrets.get(key);
  }

  async delete(key: string): Promise<void> {
    await this.context.secrets.delete(key);
  }
}

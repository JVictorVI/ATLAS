import * as vscode from "vscode";
import {
  AtlasContextProfileMode,
  AtlasContextProfileSettings,
  AtlasExecutionMode,
  AtlasStaticAnalysisConfig,
} from "../interfaces/AtlasConfigTypes";
import { AtlasConfigDefaults } from "../repository/AtlasConfigDefaults";
import { AtlasConfigRepository } from "../repository/AtlasConfigRepository";
import { AtlasSettingsService } from "../services/AtlasSettingsService";
import { AtlasProviderService } from "../services/AtlasProviderService";
import { AtlasModelRegistryService } from "../services/AtlasModelRegistryService";
import { AtlasSelectionService } from "../services/AtlasSelectionService";
import { AtlasContextProfileService } from "../services/AtlasContextProfileService";

export {
  JsonMap,
  AtlasRagIndexingMode,
  AtlasResponseLanguage,
  AtlasGeneralSettings,
  AtlasCloudConfigs,
  AtlasRagSettings,
  AtlasEngineSettings,
  AtlasUiSettings,
  AtlasLlmDefaults,
  AtlasModelParameters,
  AtlasModelMetadata,
  AtlasModelConfig,
  AtlasLlmSelection,
  AtlasLlmSettings,
  AtlasContextProfileMode,
  AtlasContextProfileSettings,
  AtlasStaticAnalysisConfig,
  ProviderConfig,
  AtlasConfigSchema,
  AtlasExecutionMode,
  AtlasResolvedCloudSelection,
  AtlasResolvedLocalSelection,
  AtlasResolvedSelection,
} from "../interfaces/AtlasConfigTypes";

export class AtlasConfigManager {
  private readonly defaults: AtlasConfigDefaults;
  private readonly repository: AtlasConfigRepository;
  private readonly settingsService: AtlasSettingsService;
  private readonly providerService: AtlasProviderService;
  private readonly modelRegistry: AtlasModelRegistryService;
  private readonly selectionService: AtlasSelectionService;

  constructor(context: vscode.ExtensionContext) {
    this.defaults = new AtlasConfigDefaults();
    this.repository = new AtlasConfigRepository(context, this.defaults);
    this.settingsService = new AtlasSettingsService(this.repository);
    this.providerService = new AtlasProviderService(this.repository);
    this.modelRegistry = new AtlasModelRegistryService(this.repository);
    this.selectionService = new AtlasSelectionService(
      this.repository,
      this.providerService,
      this.modelRegistry,
    );
  }

  // CONFIG
  public getConfig() {
    return this.settingsService.getConfig();
  }

  public saveConfig(config: any) {
    this.settingsService.saveConfig(config);
  }

  public resetConfig() {
    return this.settingsService.resetConfig();
  }

  public getDefaultConfig() {
    return this.defaults.createDefaultConfig();
  }

  public getSection(section: any) {
    return this.settingsService.getSection(section);
  }

  public updateSection(section: any, partialData: any) {
    return this.settingsService.updateSection(section, partialData);
  }

  public updateCloudConfigs(settings: any) {
    return this.settingsService.updateCloudConfigs(settings);
  }

  public updateRagSettings(settings: any) {
    return this.settingsService.updateRagSettings(settings);
  }

  public updateUiSettings(settings: any) {
    return this.settingsService.updateUiSettings(settings);
  }

  public updateGeneralSettings(settings: any) {
    return this.settingsService.updateGeneralSettings(settings);
  }

  public updateLlmDefaults(defaults: any) {
    return this.settingsService.updateLlmDefaults(defaults);
  }

  public updateCustomRoot(customData: any) {
    return this.settingsService.updateCustomRoot(customData);
  }

  public getContextProfile(
    executionMode: AtlasExecutionMode = this.getCurrentMode(),
  ): AtlasContextProfileSettings {
    return AtlasContextProfileService.resolve(this.getConfig(), executionMode);
  }

  public setContextProfile(
    profile: Partial<AtlasContextProfileSettings> & {
      mode?: AtlasContextProfileMode;
    },
    executionMode: AtlasExecutionMode = this.getCurrentMode(),
  ) {
    const config = this.getConfig();
    const normalized = AtlasContextProfileService.normalize(
      profile,
      this.getContextProfile(executionMode),
    );

    config.custom = {
      ...(config.custom ?? {}),
      contextProfiles: {
        local: this.getContextProfile("local"),
        cloud: this.getContextProfile("cloud"),
        [executionMode]: normalized,
      },
    };

    config.updatedAt = new Date().toISOString();
    this.saveConfig(config);
    return config;
  }

  // MODE / SELECTION
  public getCurrentMode() {
    return this.selectionService.getCurrentMode();
  }

  public isCloudMode() {
    return this.selectionService.isCloudMode();
  }

  public isLocalMode() {
    return this.selectionService.isLocalMode();
  }

  public setMode(mode: "local" | "cloud") {
    return this.selectionService.setMode(mode);
  }

  public setActiveLocalModel(modelId: string | null) {
    return this.selectionService.setActiveLocalModel(modelId);
  }

  public setSelectedCloudProvider(providerId: string | null) {
    return this.selectionService.setSelectedCloudProvider(providerId);
  }

  public setActiveCloudModel(modelId: string | null) {
    return this.selectionService.setActiveCloudModel(modelId);
  }

  public getActiveLocalModel() {
    return this.selectionService.getActiveLocalModel();
  }

  public getSelectedCloudSelection() {
    return this.selectionService.getSelectedCloudSelection();
  }

  public getSelectedCloudProviderId() {
    return this.selectionService.getSelectedCloudProviderId();
  }

  public getSelectedCloudModelId() {
    return this.selectionService.getSelectedCloudModelId();
  }

  public getResolvedCloudSelection() {
    return this.selectionService.getResolvedCloudSelection();
  }

  public getResolvedLocalSelection() {
    return this.selectionService.getResolvedLocalSelection();
  }

  public getResolvedSelectionForCurrentMode() {
    return this.selectionService.getResolvedSelectionForCurrentMode();
  }

  // MODELS (agora só locais)
  public getLocalModel(modelId: string) {
    return this.modelRegistry.getLocalModel(modelId);
  }

  public getAllModels() {
    return this.modelRegistry.getAllModels();
  }

  public getLocalModels() {
    return this.modelRegistry.getLocalModels();
  }

  public upsertModel(model: any) {
    return this.modelRegistry.upsertModel(model);
  }

  public updateModel(modelId: string, partialData: any) {
    return this.modelRegistry.updateModel(modelId, partialData);
  }

  public removeModel(modelId: string) {
    return this.modelRegistry.removeModel(modelId);
  }

  // PROVIDERS
  public getProvider(providerId: string) {
    return this.providerService.getProvider(providerId);
  }

  public getSelectedProvider() {
    return this.providerService.getSelectedProvider();
  }

  public getAllProviders() {
    return this.providerService.getAllProviders();
  }

  public saveProviders(providers: any[]) {
    return this.providerService.saveProviders(providers);
  }

  public addProvider(provider: any) {
    return this.providerService.addProvider(provider);
  }

  public updateProvider(providerId: string, partialData: any) {
    return this.providerService.updateProvider(providerId, partialData);
  }

  public removeProvider(providerId: string) {
    return this.providerService.removeProvider(providerId);
  }

  public isStudyModeEnabled(): boolean {
    const config = this.getConfig();
    return config.custom?.studyMode?.enabled === true;
  }

  public setStudyModeEnabled(enabled: boolean): void {
    const config = this.getConfig();

    config.custom = {
      ...(config.custom ?? {}),
      studyMode: {
        ...(config.custom?.studyMode ?? {}),
        enabled,
      },
    };

    config.updatedAt = new Date().toISOString();
    this.saveConfig(config);
  }

  public isRefactoringEnabled(): boolean {
    return this.getConfig().custom?.refactoring?.enabled !== false;
  }

  public useModelIntentDetectionForCodeEditing(): boolean {
    return (
      this.getConfig().custom?.refactoring?.useModelIntentDetection === true
    );
  }

  public getStaticAnalysisConfig(
    executionMode: AtlasExecutionMode = this.getCurrentMode(),
  ): AtlasStaticAnalysisConfig {
    const presetEffects = AtlasContextProfileService.getPresetEffects(
      this.getContextProfile(executionMode).mode,
    );

    if (presetEffects) {
      return presetEffects.staticAnalysis;
    }

    const configured = this.getConfig().custom?.staticAnalysis;

    return {
      enabled: configured?.enabled !== false,
      useInQuickAnalysis: configured?.useInQuickAnalysis !== false,
      useInArchitecturalAnalysis:
        configured?.useInArchitecturalAnalysis !== false,
      useInRefactoring: configured?.useInRefactoring !== false,
      includeDiagnostics: configured?.includeDiagnostics === true,
      includeSymbolRelations: configured?.includeSymbolRelations === true,
    };
  }

  public isStaticAnalysisEnabledFor(
    mode: "quick-analysis" | "architectural-analysis",
  ): boolean {
    const config = this.getStaticAnalysisConfig();
    const contextProfile = this.getContextProfile();

    if (!config.enabled || !contextProfile.includeStaticAnalysis) {
      return false;
    }

    return mode === "quick-analysis"
      ? config.useInQuickAnalysis
      : config.useInArchitecturalAnalysis;
  }
}

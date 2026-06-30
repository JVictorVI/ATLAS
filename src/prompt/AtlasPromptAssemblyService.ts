import { ChatMessage } from "../interfaces/ApiTypes";
import { AtlasSystemPromptPolicyService } from "./AtlasSystemPromptPolicyService";
import { AtlasPromptCustomizationService } from "./AtlasPromptCustomizationService";
import { AtlasPromptModeResolver } from "./AtlasPromptModeResolver";
import {
  AtlasPromptAssemblyInput,
  AtlasPromptAssemblyResult,
} from "../interfaces/AtlasPromptTypes";
import { AtlasContextProfileService } from "../services/AtlasContextProfileService";

export class AtlasPromptAssemblyService {
  constructor(
    private readonly policyService: AtlasSystemPromptPolicyService,
    private readonly customizationService: AtlasPromptCustomizationService,
    private readonly modeResolver: AtlasPromptModeResolver,
  ) {}

  public buildMessages(
    input: AtlasPromptAssemblyInput,
  ): AtlasPromptAssemblyResult {
    const contextProfile = input.contextProfile
      ? AtlasContextProfileService.normalize(input.contextProfile)
      : AtlasContextProfileService.getDefaultProfile();
    const mode = this.modeResolver.resolve({
      userQuestion: input.userQuestion,
      hasCodeContext:
        contextProfile.includeEditorContext && input.hasCodeContext,
      hasAnalysisContext:
        contextProfile.includeEditorContext &&
        Boolean(input.analysisContext?.length),
      hasRagContext:
        contextProfile.includeRagContext && Boolean(input.ragContext?.length),
      forcedMode: input.forcedMode,
    });

    const messages: ChatMessage[] = [];

    // 1. Base system prompt (highest priority)
    const baseSystemMessage = this.policyService.buildBaseSystemMessage(mode);
    messages.push({ role: "system", content: baseSystemMessage });

    // 2. Architectural summary from long-term memory (injected before customization)
    if (
      contextProfile.includeArchitecturalMemory &&
      input.architecturalSummary &&
      mode !== "quick-analysis"
    ) {
      messages.push({
        role: "system",
        content: [
          "Memória de longo prazo desta sessão (decisões e análises anteriores resumidas):",
          input.architecturalSummary,
          "",
          "Use este contexto para manter coerência arquitetural nas respostas, mas priorize as mensagens recentes abaixo.",
        ].join("\n"),
      });
    }

    // 3. User customization block
    const customizationBlock = this.customizationService.buildCustomizationBlock();
    if (customizationBlock && mode !== "quick-analysis") {
      messages.push({ role: "system", content: customizationBlock });
    }

    // 4. Code/analysis context from editor
    if (contextProfile.includeEditorContext && input.analysisContext?.length) {
      messages.push({
        role: "system",
        content: [
          "Contexto estrutural disponível:",
          ...input.analysisContext.map((item) => `- ${item}`),
        ].join("\n"),
      });
    }

    // 5. RAG context
    if (
      contextProfile.includeRagContext &&
      mode !== "quick-analysis" &&
      input.ragContext?.length
    ) {
      messages.push({
        role: "system",
        content: [
          "Contexto recuperado relevante:",
          ...input.ragContext.map((item) => `- ${item}`),
        ].join("\n"),
      });
    }

    // 6. Sliding window: last configured messages from conversation history
    if (input.history?.length && mode !== "quick-analysis") {
      const windowedHistory = this.applyWindow(
        input.history,
        contextProfile.historyWindowSize,
      );

      // Debug log for token monitoring validation
      console.log(
        `[ATLAS] Context window: total=${input.history.length}, sending=${windowedHistory.length}/${contextProfile.historyWindowSize} messages`,
      );

      messages.push(...windowedHistory);
    }

    // 7. Current user question
    messages.push({ role: "user", content: input.userQuestion });

    return { mode, messages };
  }

  /**
   * Applies the sliding window: only keeps the last configured number of
   * non-system messages (preserving role pairs when possible).
   */
  private applyWindow(
    history: ChatMessage[],
    windowSize: number,
  ): ChatMessage[] {
    if (windowSize <= 0) {
      return [];
    }

    const nonSystem = history.filter((m) => m.role !== "system");
    return nonSystem.slice(-windowSize).map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }
}

import { ChatMessage } from "../interfaces/ApiTypes";
import { AtlasSystemPromptPolicyService } from "./AtlasSystemPromptPolicyService";
import { AtlasPromptCustomizationService } from "./AtlasPromptCustomizationService";
import { AtlasPromptModeResolver } from "./AtlasPromptModeResolver";
import {
  AtlasPromptAssemblyInput,
  AtlasPromptAssemblyResult,
} from "../interfaces/AtlasPromptTypes";

const WINDOW_SIZE = 10;

export class AtlasPromptAssemblyService {
  constructor(
    private readonly policyService: AtlasSystemPromptPolicyService,
    private readonly customizationService: AtlasPromptCustomizationService,
    private readonly modeResolver: AtlasPromptModeResolver,
  ) {}

  public buildMessages(
    input: AtlasPromptAssemblyInput,
  ): AtlasPromptAssemblyResult {
    const mode = this.modeResolver.resolve({
      userQuestion: input.userQuestion,
      hasCodeContext: input.hasCodeContext,
      hasAnalysisContext: Boolean(input.analysisContext?.length),
      hasRagContext: Boolean(input.ragContext?.length),
      forcedMode: input.forcedMode,
    });

    const messages: ChatMessage[] = [];

    // 1. Base system prompt (highest priority)
    const baseSystemMessage = this.policyService.buildBaseSystemMessage(mode);
    messages.push({ role: "system", content: baseSystemMessage });

    // 2. Architectural summary from long-term memory (injected before customization)
    if (input.architecturalSummary && mode !== "quick-analysis") {
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
    if (input.analysisContext?.length) {
      messages.push({
        role: "system",
        content: [
          "Contexto estrutural disponível:",
          ...input.analysisContext.map((item) => `- ${item}`),
        ].join("\n"),
      });
    }

    // 5. RAG context (architectural mode only)
    if (mode === "architectural-analysis" && input.ragContext?.length) {
      messages.push({
        role: "system",
        content: [
          "Contexto recuperado relevante:",
          ...input.ragContext.map((item) => `- ${item}`),
        ].join("\n"),
      });
    }

    // 6. Sliding window: last WINDOW_SIZE messages from conversation history
    if (input.history?.length && mode !== "quick-analysis") {
      const windowedHistory = this.applyWindow(input.history);

      // Debug log for token monitoring validation
      console.log(
        `[ATLAS] Context window: total=${input.history.length}, sending=${windowedHistory.length}/${WINDOW_SIZE} messages`,
      );

      messages.push(...windowedHistory);
    }

    // 7. Current user question
    messages.push({ role: "user", content: input.userQuestion });

    return { mode, messages };
  }

  /**
   * Applies the sliding window: only keeps the last WINDOW_SIZE
   * non-system messages (preserving role pairs when possible).
   */
  private applyWindow(history: ChatMessage[]): ChatMessage[] {
    const nonSystem = history.filter((m) => m.role !== "system");
    return nonSystem.slice(-WINDOW_SIZE);
  }
}
import { ChatMessage } from "../interfaces/ApiTypes";
import { AtlasSystemPromptPolicyService } from "./AtlasSystemPromptPolicyService";
import { AtlasPromptCustomizationService } from "./AtlasPromptCustomizationService";
import { AtlasPromptModeResolver } from "./AtlasPromptModeResolver";
import {
  AtlasPromptAssemblyInput,
  AtlasPromptAssemblyResult,
} from "../interfaces/AtlasPromptTypes";

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

    const baseSystemMessage = this.policyService.buildBaseSystemMessage(mode);
    messages.push({
      role: "system",
      content: baseSystemMessage,
    });

    const customizationBlock =
      this.customizationService.buildCustomizationBlock();

    if (customizationBlock && mode !== "quick-analysis") {
      messages.push({
        role: "system",
        content: customizationBlock,
      });
    }

    if (input.analysisContext?.length) {
      messages.push({
        role: "system",
        content: [
          "Contexto estrutural disponível:",
          ...input.analysisContext.map((item) => `- ${item}`),
        ].join("\n"),
      });
    }

    if (mode === "architectural-analysis" && input.ragContext?.length) {
      messages.push({
        role: "system",
        content: [
          "Contexto recuperado relevante:",
          ...input.ragContext.map((item) => `- ${item}`),
        ].join("\n"),
      });
    }

    if (input.history?.length && mode !== "quick-analysis") {
      messages.push(...input.history);
    }

    messages.push({
      role: "user",
      content: input.userQuestion,
    });

    return {
      mode,
      messages,
    };
  }
}

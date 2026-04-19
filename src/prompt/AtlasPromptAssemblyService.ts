import { ChatMessage } from "../interfaces/ApiTypes";
import { AtlasSystemPromptPolicyService } from "./AtlasSystemPromptPolicyService";
import { AtlasPromptCustomizationService } from "./AtlasPromptCustomizationService";
import {
  AtlasPromptMode,
  AtlasPromptModeResolver,
} from "./AtlasPromptModeResolver";

export type AtlasPromptAssemblyInput = {
  userQuestion: string;
  history?: ChatMessage[];
  analysisContext?: string[];
  ragContext?: string[];
  hasCodeContext?: boolean;
};

export type AtlasPromptAssemblyResult = {
  mode: AtlasPromptMode;
  messages: ChatMessage[];
};

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
    });

    const messages: ChatMessage[] = [];

    const baseSystemMessage = this.policyService.buildBaseSystemMessage(mode);
    messages.push({
      role: "system",
      content: baseSystemMessage,
    });

    if (mode !== "out-of-scope") {
      const customizationBlock =
        this.customizationService.buildCustomizationBlock();

      if (customizationBlock) {
        messages.push({
          role: "system",
          content: customizationBlock,
        });
      }
    }

    if (mode === "architectural-analysis" && input.analysisContext?.length) {
      messages.push({
        role: "system",
        content: [
          "Contexto de análise estrutural disponível:",
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

    if (input.history?.length && mode !== "out-of-scope") {
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

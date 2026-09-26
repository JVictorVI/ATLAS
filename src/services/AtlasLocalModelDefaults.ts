export const ATLAS_LOCAL_CONTEXT_MAX_TOKENS = 1_000_000;

export function validateLocalContextWindow(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > ATLAS_LOCAL_CONTEXT_MAX_TOKENS
  ) {
    throw new Error(
      "O tamanho do contexto local deve ser um inteiro entre 1 e 1.000.000 tokens.",
    );
  }

  return value;
}

export const ATLAS_LOCAL_MODEL_DEFAULTS = {
  temperature: 0.4,
  maxTokens: 8192,
  topP: 0.95,
  gpuLayers: 0,
  contextWindow: 8192,
  threads: 0,
  batchSize: 0,
  microBatchSize: 0,
  flashAttention: "auto",
  kvCacheType: "auto",
  loadMode: "auto",
} as const;

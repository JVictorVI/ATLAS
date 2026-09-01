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

export interface HuggingFaceGgufFile {
  name: string;
  sizeBytes: number | null;
  size: string;
  quantization: string;
  downloadUrl: string;
  fileUrl: string;
}

export interface HuggingFaceOnnxFile extends HuggingFaceGgufFile {}

export type HuggingFaceModelFormat = "GGUF" | "ONNX";

export interface HuggingFaceModelSummary {
  id: string;
  name: string;
  author: string;
  downloads: number;
  likes: number;
  gated: boolean;
  private: boolean;
  pipelineTag: string | null;
  updatedAt: string | null;
  tags: string[];
  description: string;
  format: HuggingFaceModelFormat;
  parameterCount: number | null;
  ggufFiles: HuggingFaceGgufFile[];
  onnxFiles: HuggingFaceOnnxFile[];
  repositoryFiles: string[];
}

export interface HuggingFaceModelDetails extends HuggingFaceModelSummary {}

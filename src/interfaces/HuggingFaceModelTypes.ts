export interface HuggingFaceGgufFile {
  name: string;
  sizeBytes: number | null;
  size: string;
  quantization: string;
  downloadUrl: string;
  fileUrl: string;
}

export interface HuggingFaceModelSummary {
  id: string;
  name: string;
  author: string;
  downloads: number;
  likes: number;
  updatedAt: string | null;
  tags: string[];
  ggufFiles: HuggingFaceGgufFile[];
}

export interface HuggingFaceModelDetails extends HuggingFaceModelSummary {
  description: string;
}

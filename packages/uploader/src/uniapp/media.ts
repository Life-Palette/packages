export type { MediaAnalysisResult } from "@life-palette/media/shared";
export {
  analyzeMedia,
  type MediaAnalysisOptions,
  type MediaConfig,
  type MediaRuntime,
  readMediaBytes,
} from "./media/analyze";
export {
  type CompressionOptions,
  compressImage,
  type PrepareUploadOptions,
  prepareUpload,
} from "./media/compress";

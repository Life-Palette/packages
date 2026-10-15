import { createUploader, prepareUpload, type UploadCancellation, type UploadFile, type UniPlatform } from "@life-palette/uploader-uniapp";
// #ifdef H5
import { createBrowserMediaAdapter } from "@life-palette/uploader-uniapp/browser";
// #endif

export interface UploadWorkflowOptions {
  apiBaseUrl: string;
  token: string;
  platform: UniPlatform;
  isPrivate?: boolean;
  compress?: boolean;
  maxSizeMB?: number;
  cancellation?: UploadCancellation;
  onProgress?: (progress: { stage: string; percent: number }) => void;
}

export async function uploadMediaFile(file: UploadFile, options: UploadWorkflowOptions) {
  let browser = {};
  // #ifdef H5
  browser = createBrowserMediaAdapter();
  // #endif
  const prepared = await prepareUpload(file, { platform: options.platform, ...browser }, {
    compression: options.compress ? {
      maxSizeMB: options.maxSizeMB ?? 1,
      cancellation: options.cancellation,
      onProgress: (percent) => options.onProgress?.({ stage: "compressing", percent }),
    } : false,
    analysis: {
      cancellation: options.cancellation,
      onProgress: ({ stage, percent }) => options.onProgress?.({ stage: `analyzing:${stage}`, percent }),
    },
  });
  try {
    const uploader = createUploader({ apiBaseUrl: options.apiBaseUrl, getToken: () => options.token || null, platform: options.platform });
    const uploaded = await uploader.upload(prepared.file, {
      checksum: prepared.checksum,
      metadata: prepared.metadata,
      cancellation: options.cancellation,
      isPrivate: options.isPrivate,
      onProgress: options.onProgress,
    });
    return { uploaded, metadata: prepared.metadata };
  } finally {
    await prepared.dispose();
  }
}

export { analyzeMedia, prepareUpload } from "@life-palette/uploader-uniapp";

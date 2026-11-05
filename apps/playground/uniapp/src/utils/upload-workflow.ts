import {
  createUploader,
  type UniPlatform,
  type UploadCancellation,
  type UploadFile,
} from "@life-palette/uploader/uniapp";
import { prepareUpload } from "@life-palette/uploader/uniapp/media";
// #ifdef H5
import { createBrowserMediaAdapter } from "@life-palette/uploader/uniapp/browser";
// #endif

export interface UploadWorkflowOptions {
  apiBaseUrl: string;
  cancellation?: UploadCancellation;
  compress?: boolean;
  isPrivate?: boolean;
  maxSizeMB?: number;
  onProgress?: (progress: { stage: string; percent: number }) => void;
  platform: UniPlatform;
  token: string;
}

export async function uploadMediaFile(
  file: UploadFile,
  options: UploadWorkflowOptions
) {
  let browser = {};
  // #ifdef H5
  browser = createBrowserMediaAdapter();
  // #endif
  const prepared = await prepareUpload(
    file,
    { platform: options.platform, ...browser },
    {
      analysis: {
        cancellation: options.cancellation,
        onProgress: ({ stage, percent }) =>
          options.onProgress?.({ percent, stage: `analyzing:${stage}` }),
      },
      compression: options.compress
        ? {
            cancellation: options.cancellation,
            maxSizeMB: options.maxSizeMB ?? 1,
            onProgress: (percent) =>
              options.onProgress?.({ percent, stage: "compressing" }),
          }
        : false,
    }
  );
  try {
    const uploader = createUploader({
      apiBaseUrl: options.apiBaseUrl,
      getToken: () => options.token || null,
      platform: options.platform,
    });
    const uploaded = await uploader.upload(prepared.file, {
      cancellation: options.cancellation,
      checksum: prepared.checksum,
      isPrivate: options.isPrivate,
      metadata: prepared.metadata,
      onProgress: options.onProgress,
    });
    return { metadata: prepared.metadata, uploaded };
  } finally {
    await prepared.dispose();
  }
}

export { analyzeMedia, prepareUpload } from "@life-palette/uploader/uniapp/media";

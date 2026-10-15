import { analyzeMedia } from "@life-palette/media";
import { compressImage } from "@life-palette/uploader";
import type { MediaConfig } from "./media";

/** Import only in an H5 entry or a uni-app H5 conditional block. */
export function createBrowserMediaAdapter(): Pick<MediaConfig, "browser"> {
  return { browser: { analyze: analyzeMedia, compress: compressImage } };
}

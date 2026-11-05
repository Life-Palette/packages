import { createUploader as createCoreUploader } from "../core/core-uploader";
import { type FileConfig, openUploadFile } from "./file";
import { createTransport, type TransportConfig } from "./transport";
import type { UploadFile } from "./types";

export interface UploaderConfig extends FileConfig, TransportConfig {
  partConcurrency?: number;
  partRetries?: number;
  retryDelayMs?: number;
}

/** Uni-app file and request adapters over the shared upload protocol. */
export function createUploader(config: UploaderConfig) {
  const transport = createTransport(config);
  return createCoreUploader({
    onCleanupError: config.onCleanupError,
    openFile: (file: UploadFile) => openUploadFile(file, config),
    partConcurrency: config.partConcurrency,
    partRetries: config.partRetries,
    put: transport.put,
    request: transport.request,
    retryDelayMs: config.retryDelayMs,
  });
}

export {
  integer,
  readRange,
  retry,
  uploadMultipart,
} from "../core/core-uploader";

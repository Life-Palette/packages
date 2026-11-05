import type { UploadMetadata } from "./metadata";

export type { UploadMetadata } from "./metadata";

export interface UploadFile {
  name?: string;
  path: string;
  /** H5 adapters may keep the original browser file to avoid reading a blob URL. */
  sourceFile?: Blob & { name?: string };
}

export interface UploadedFile {
  file_md5: string;
  is_private: boolean;
  name: string;
  size: number;
  type: string;
  uid: string;
  url: string;
  [key: string]: unknown;
}

export interface UploadPart {
  etag: string;
  part_number: number;
}

export interface UploadSession {
  existing_file?: UploadedFile;
  id: string;
  mode: "direct" | "multipart";
  part_size?: number;
  parts?: Array<{
    part_number: number;
    url: string;
    headers?: Record<string, string>;
    expires_at: number;
  }>;
  size: number;
  total_parts: number;
  upload?: {
    method: "PUT";
    url: string;
    headers?: Record<string, string>;
    expires_at: number;
  };
  uploaded_parts?: UploadPart[];
}

export interface UploadProgress {
  partNumber?: number;
  percent: number;
  stage: "md5" | "initializing" | "uploading" | "completing";
  totalParts?: number;
}

export interface UploadOptions {
  cancellation?: UploadCancellation;
  checksum?: string;
  isPrivate?: boolean;
  metadata?: UploadMetadata;
  onProgress?: (progress: UploadProgress) => void;
  partConcurrency?: number;
  partRetries?: number;
}

export class UploadError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    options?: ErrorOptions & {
      status?: number;
      details?: unknown;
      retryable?: boolean;
    }
  ) {
    super(message, options);
    this.name = "UploadError";
    this.status = options?.status;
    this.details = options?.details;
    this.retryable =
      options?.retryable ??
      (options?.status === 429 ||
        (options?.status !== undefined &&
          options.status >= 500 &&
          options.status < 600));
  }
}

export class UploadCancelledError extends UploadError {
  constructor() {
    super("Upload cancelled");
    this.name = "UploadCancelledError";
  }
}

/** Works across browser, Expo, and uni-app runtimes. */
export class UploadCancellation {
  private readonly listeners = new Set<() => void>();
  private cancelled = false;

  get aborted(): boolean {
    return this.cancelled;
  }

  throwIfAborted(): void {
    if (this.cancelled) {
      throw new UploadCancelledError();
    }
  }

  cancel(): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* One listener cannot prevent other tasks from cancelling. */
      }
    }
    this.listeners.clear();
  }

  subscribe(listener: () => void): () => void {
    if (this.cancelled) {
      listener();
      return () => undefined;
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

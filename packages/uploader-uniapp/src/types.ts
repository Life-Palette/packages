export interface UploadFile {
  name?: string;
  path: string;
  /** H5 chooseImage returns a browser File. Keep it to avoid reading its blob URL. */
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
  onProgress?: (progress: UploadProgress) => void;
  partConcurrency?: number;
  /** Number of retries after the first attempt. */
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

/** Works in mini-programs without browser AbortController. */
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

export class PermissionError extends Error {
  readonly permission: string;

  constructor(permission: string, options?: ErrorOptions) {
    super(`Permission denied: ${permission}`, options);
    this.name = "PermissionError";
    this.permission = permission;
  }
}

export class SelectionCancelledError extends Error {
  constructor(options?: ErrorOptions) {
    super("File selection cancelled", options);
    this.name = "SelectionCancelledError";
  }
}

export interface UniFailure {
  errMsg?: string;
}

export interface Callbacks<T> {
  fail: (error: UniFailure) => void;
  success: (result: T) => void;
}

export interface FileInfo {
  digest?: string;
  size: number;
}

export interface FileSystem {
  close?: (options: Callbacks<unknown> & { fd: string }) => void;
  getFileInfo?: (
    options: Callbacks<FileInfo> & { filePath: string; digestAlgorithm: "md5" }
  ) => void;
  open?: (
    options: Callbacks<{ fd: string }> & { filePath: string; flag: "r" }
  ) => void;
  read?: (
    options: Callbacks<{ bytesRead: number; arrayBuffer: ArrayBuffer }> & {
      fd: string;
      arrayBuffer: ArrayBuffer;
      offset: number;
      position: number;
      length: number;
    }
  ) => void;
  stat?: (
    options: Callbacks<{ stats: { size: number } }> & { path: string }
  ) => void;
  unlink?: (options: Callbacks<unknown> & { filePath: string }) => void;
  writeFile?: (
    options: Callbacks<unknown> & { filePath: string; data: ArrayBuffer }
  ) => void;
}

export interface UniRuntime {
  authorize?: (options: Callbacks<unknown> & { scope: string }) => void;
  base64ToArrayBuffer?: (data: string) => ArrayBuffer;
  chooseImage?: (
    options: Callbacks<{
      tempFilePaths: string[];
      tempFiles: Array<{
        path?: string;
        name?: string;
        size: number;
        file?: Blob & { name?: string };
      }>;
    }> & {
      count: number;
      sourceType: Array<"album" | "camera">;
      sizeType: Array<"original" | "compressed">;
    }
  ) => void;
  env?: { USER_DATA_PATH?: string };
  getAppAuthorizeSetting?: () => {
    cameraAuthorized?: string;
    albumAuthorized?: string;
  };
  getFileInfo?: (
    options: Callbacks<FileInfo> & { filePath: string; digestAlgorithm: "md5" }
  ) => void;
  getFileSystemManager?: () => FileSystem;
  getSetting?: (
    options: Callbacks<{ authSetting: Record<string, boolean | undefined> }>
  ) => void;
  getSystemInfoSync?: () => { uniPlatform?: string };
  openAppAuthorizeSetting?: (options: Callbacks<unknown>) => void;
  openSetting?: (
    options: Callbacks<{ authSetting: Record<string, boolean | undefined> }>
  ) => void;
  request: (
    options: Callbacks<{
      data: unknown;
      statusCode: number;
      header: Record<string, unknown>;
    }> & {
      url: string;
      method: "GET" | "POST" | "PUT" | "DELETE";
      data?: unknown;
      header: Record<string, string>;
      dataType: "json" | "text";
      responseType: "text" | "arraybuffer";
      timeout: number;
    }
  ) => unknown;
  uploadFile?: (
    options: Callbacks<{ data: string; statusCode: number }> & {
      url: string;
      filePath: string;
      name: string;
      file?: Blob;
      fileType?: "image" | "video" | "audio";
      header?: Record<string, string>;
      formData?: Record<string, string | number | boolean>;
      timeout?: number;
    }
  ) => {
    abort: () => void;
    onProgressUpdate: (
      callback: (progress: {
        progress: number;
        totalBytesSent: number;
        totalBytesExpectedToSend: number;
      }) => void
    ) => void;
  };
}

export type UniPlatform = "h5" | "mp" | "app";

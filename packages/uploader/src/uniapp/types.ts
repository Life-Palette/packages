export { UploadCancellation, UploadCancelledError, UploadError } from "../core/types";
export type {
  UploadFile,
  UploadMetadata,
  UploadOptions,
  UploadPart,
  UploadProgress,
  UploadSession,
  UploadedFile,
} from "../core/types";
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
      tempFiles: Array<
        | (Blob & { path?: string; name?: string })
        | {
            path?: string;
            name?: string;
            size: number;
            file?: Blob & { name?: string };
          }
      >;
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

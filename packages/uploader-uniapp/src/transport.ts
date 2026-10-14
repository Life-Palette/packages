import type { FileChunk } from "./file";
import {
  type Callbacks,
  type UniRuntime,
  UploadCancellation,
  UploadCancelledError,
  UploadError,
  type UploadFile,
} from "./types";

interface Envelope<T> {
  data?: T;
  details?: unknown;
  error?: string;
  message?: string;
}

export interface TransportConfig {
  apiBaseUrl: string;
  getToken: () => string | null;
  timeout?: number;
  uni?: UniRuntime;
}

export function createTransport(config: TransportConfig) {
  const api = getUni(config.uni);
  const timeout = config.timeout ?? 60_000;
  const send = (
    url: string,
    method: "POST" | "PUT" | "DELETE",
    data: unknown,
    header: Record<string, string>,
    dataType: "json" | "text",
    cancellation?: UploadCancellation
  ) =>
    nativeCall<{
      data: unknown;
      statusCode: number;
      header: Record<string, unknown>;
    }>(
      (callbacks) =>
        api.request({
          ...callbacks,
          data,
          dataType,
          header,
          method,
          responseType: "text",
          timeout,
          url,
        }),
      cancellation,
      true
    );

  async function request<T>(
    path: string,
    method: "POST" | "DELETE",
    data?: unknown,
    cancellation?: UploadCancellation
  ): Promise<T> {
    const header: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    const token = config.getToken();
    if (token) {
      header.Authorization = `Bearer ${token}`;
    }
    const result = await send(
      `${config.apiBaseUrl.replace(/\/$/, "")}${path}`,
      method,
      data,
      header,
      "json",
      cancellation
    );
    let body: Envelope<T> = {};
    try {
      body = (
        typeof result.data === "string" ? JSON.parse(result.data) : result.data
      ) as Envelope<T>;
    } catch {
      // A non-JSON error body still retains its HTTP status.
    }
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new UploadError(
        body?.message || body?.error || "Upload API request failed",
        { details: body?.details, status: result.statusCode }
      );
    }
    if (method !== "DELETE" && !body?.data) {
      throw new UploadError("Upload API returned an invalid response", {
        details: result.data,
      });
    }
    return body?.data as T;
  }

  async function put(
    url: string,
    data: ArrayBuffer,
    headers: Record<string, string> = {},
    cancellation?: UploadCancellation
  ): Promise<string> {
    // uni.uploadFile sends multipart/form-data POST, incompatible with presigned PUT.
    // A default binary content type also prevents uni.request JSON/form serialization.
    const header = { ...headers };
    if (
      !Object.keys(header).some((key) => key.toLowerCase() === "content-type")
    ) {
      header["Content-Type"] = "application/octet-stream";
    }
    const result = await send(url, "PUT", data, header, "text", cancellation);
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new UploadError(
        `Object storage upload failed: ${result.statusCode}`,
        { details: result.data, status: result.statusCode }
      );
    }
    const entry = Object.entries(result.header ?? {}).find(
      ([key]) => key.toLowerCase() === "etag"
    );
    return String(entry?.[1] ?? "").replace(/^"|"$/g, "");
  }

  return { put, request };
}

// Keep a direct uni reference so the uni-app compiler can inject its platform runtime.
declare const uni: UniRuntime;

export function getUni(runtime?: UniRuntime): UniRuntime {
  const api = runtime ?? (typeof uni === "undefined" ? undefined : uni);
  if (!api) {
    throw new UploadError("uni runtime is unavailable");
  }
  return api;
}

export function nativeCall<T>(
  run: (callbacks: Callbacks<T>) => unknown,
  cancellation?: UploadCancellation,
  retryable = false
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let task: { abort?: () => void } | undefined;
    let unsubscribe: () => void = () => undefined;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe();
      callback();
    };
    unsubscribe =
      cancellation?.subscribe(() => {
        finish(() => reject(new UploadCancelledError()));
        try {
          task?.abort?.();
        } catch {
          /* Cancellation remains authoritative. */
        }
      }) ?? unsubscribe;
    if (settled) {
      return;
    }
    try {
      task = run({
        fail: (error) =>
          finish(() =>
            reject(
              new UploadError(error.errMsg || "uni API failed", {
                cause: error,
                retryable:
                  retryable &&
                  !/domain list|certificate|\bssl\b|invalid|parameter|permission|denied|not supported/i.test(
                    error.errMsg ?? ""
                  ),
              })
            )
          ),
        success: (value) => finish(() => resolve(value)),
      }) as typeof task;
      if (cancellation?.aborted) {
        task?.abort?.();
      }
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

export interface FormUploadOptions {
  cancellation?: UploadCancellation;
  fileType?: "image" | "video" | "audio";
  formData?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  /** Server-side form field name. */
  name?: string;
  onCleanupError?: (error: unknown) => void;
  onProgress?: (progress: {
    percent: number;
    loaded: number;
    total: number;
  }) => void;
  timeout?: number;
  uni?: UniRuntime;
  url: string;
}

/** Native multipart/form-data POST. The server must accept this contract. */
export function uploadFormFile(
  file: UploadFile | string,
  options: FormUploadOptions
) {
  const api = getUni(options.uni);
  if (!api.uploadFile) {
    throw new UploadError("uni.uploadFile is unavailable");
  }
  const input = typeof file === "string" ? { path: file } : file;
  if (!input.path) {
    throw new UploadError("A local file path is required");
  }
  const headers = { ...options.headers };
  if (
    Object.keys(headers).some((key) => key.toLowerCase() === "content-type")
  ) {
    throw new UploadError(
      "Let uni.uploadFile set the multipart Content-Type and boundary"
    );
  }
  const cancellation = options.cancellation ?? new UploadCancellation();
  const result = nativeCall<{ data: string; statusCode: number }>(
    (callbacks) => {
      const task = api.uploadFile?.({
        ...callbacks,
        filePath: input.path,
        url: options.url,
        ...(input.sourceFile ? { file: input.sourceFile } : {}),
        fileType: options.fileType,
        formData: options.formData,
        header: headers,
        name: options.name ?? "file",
        timeout: options.timeout ?? 60_000,
      });
      task?.onProgressUpdate((progress) => {
        if (!cancellation.aborted) {
          options.onProgress?.({
            loaded: progress.totalBytesSent,
            percent: progress.progress,
            total: progress.totalBytesExpectedToSend,
          });
        }
      });
      return task;
    },
    cancellation,
    true
  ).then((response) => {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new UploadError(`Form upload failed: ${response.statusCode}`, {
        details: response.data,
        status: response.statusCode,
      });
    }
    return response;
  });
  return { abort: () => cancellation.cancel(), result };
}

/** Owns the generated chunk file until its native upload settles. */
export function uploadFormChunk(chunk: FileChunk, options: FormUploadOptions) {
  const cancellation = options.cancellation ?? new UploadCancellation();
  const result = (async () => {
    cancellation.throwIfAborted();
    const temporary = await chunk.toFile();
    try {
      cancellation.throwIfAborted();
      return await uploadFormFile(temporary.file, { ...options, cancellation })
        .result;
    } finally {
      try {
        await temporary.dispose();
      } catch (error) {
        try {
          options.onCleanupError?.(error);
        } catch {
          /* Preserve upload result. */
        }
      }
    }
  })();
  return { abort: () => cancellation.cancel(), result };
}

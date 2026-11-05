import { createUploader as createCoreUploader } from "../core/core-uploader";
import type { FileReaderAdapter } from "../core/file-reader";
import {
  UploadError,
  type UploadedFile,
  type UploadFile,
  type UploadOptions,
} from "../core/types";

export type { UploadMetadata } from "../core/metadata";
export type {
  UploadedFile,
  UploadOptions,
  UploadPart,
  UploadProgress,
  UploadSession,
} from "../core/types";
export { UploadError } from "../core/types";

export interface UploaderConfig {
  /** API base URL, for example: https://api.example.com/api/v1 */
  apiBaseUrl: string;
  /** Injectable fetch implementation for browser and custom runtimes. */
  fetch?: typeof fetch;
  /** Return the current access token without the Bearer prefix. */
  getToken: () => string | null;
  /** Default concurrent part uploads. */
  partConcurrency?: number;
  /** Default retries after the first failed PUT. */
  partRetries?: number;
}

const HASH_CHUNK_SIZE = 2 * 1024 * 1024;

async function hashBlob(
  blob: Blob,
  onProgress?: (percent: number) => void
): Promise<string> {
  const { default: SparkMD5 } = await import("spark-md5");
  const hash = new SparkMD5.ArrayBuffer();
  const total = Math.max(1, Math.ceil(blob.size / HASH_CHUNK_SIZE));
  for (let index = 0; index < total; index += 1) {
    const start = index * HASH_CHUNK_SIZE;
    hash.append(
      await blob
        .slice(start, Math.min(start + HASH_CHUNK_SIZE, blob.size))
        .arrayBuffer()
    );
    onProgress?.(Math.round(((index + 1) / total) * 100));
  }
  return hash.end();
}

function createBlobReader(file: Blob & { name?: string }): FileReaderAdapter {
  const name = file.name || "upload";
  return {
    checksum: hashBlob.bind(null, file),
    close: async () => undefined,
    name,
    read: (start, end) => file.slice(start, end).arrayBuffer(),
    size: file.size,
  };
}

function createFetchTransport(config: UploaderConfig) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("A fetch implementation is required");
  }
  const baseUrl = config.apiBaseUrl.replace(/\/$/u, "");

  function fetchWithCancellation(
    url: string,
    init: RequestInit,
    cancellation?: UploadOptions["cancellation"]
  ) {
    const controller = new AbortController();
    const unsubscribe = cancellation?.subscribe(() => controller.abort());
    if (cancellation?.aborted) {
      controller.abort();
    }
    return fetchImpl(url, { ...init, signal: controller.signal }).finally(() =>
      unsubscribe?.()
    );
  }

  async function sendRequest(
    url: string,
    init: RequestInit,
    cancellation?: UploadOptions["cancellation"]
  ) {
    try {
      return await fetchWithCancellation(url, init, cancellation);
    } catch (error) {
      if (cancellation?.aborted) {
        cancellation.throwIfAborted();
      }
      throw new UploadError(
        `Upload request failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  async function request<T>(
    path: string,
    method: "POST" | "DELETE",
    data?: unknown,
    cancellation?: UploadOptions["cancellation"]
  ): Promise<T> {
    const headers = requestHeaders(config.getToken(), data);
    const response = await sendRequest(
      `${baseUrl}${path}`,
      {
        body: data === undefined ? undefined : JSON.stringify(data),
        headers,
        method,
      },
      cancellation
    );
    const body = await parseApiResponse<T>(response);
    if (!response.ok) {
      throw new UploadError(
        body.message || body.error || "Upload API request failed",
        {
          details: body.details,
          status: response.status,
        }
      );
    }
    if (method !== "DELETE" && body.data === undefined) {
      throw new UploadError("Upload API returned an invalid response", {
        details: body,
      });
    }
    return body.data as T;
  }

  async function put(
    url: string,
    data: ArrayBuffer,
    suppliedHeaders: Record<string, string> = {},
    cancellation?: UploadOptions["cancellation"]
  ): Promise<string> {
    const headers = new Headers(suppliedHeaders);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/octet-stream");
    }
    let response: Response;
    try {
      response = await fetchWithCancellation(
        url,
        {
          body: data,
          headers,
          method: "PUT",
        },
        cancellation
      );
    } catch (error) {
      if (cancellation?.aborted) {
        cancellation.throwIfAborted();
      }
      throw new UploadError(
        `Object storage upload failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error, retryable: true }
      );
    }
    if (!response.ok) {
      throw new UploadError(
        `Object storage upload failed: ${response.status}`,
        {
          status: response.status,
        }
      );
    }
    return response.headers.get("ETag")?.replace(/^"|"$/gu, "") ?? "";
  }
  return { put, request };
}

function requestHeaders(token: string | null, data: unknown) {
  const headers = new Headers({ Accept: "application/json" });
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (data !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function parseApiResponse<T>(response: Response): Promise<{
  data?: T;
  details?: unknown;
  error?: string;
  message?: string;
}> {
  const text = await response.text();
  try {
    return text
      ? (JSON.parse(text) as {
          data?: T;
          details?: unknown;
          error?: string;
          message?: string;
        })
      : {};
  } catch {
    // Preserve the HTTP status when a server returns a non-JSON error body.
    return {};
  }
}

export function createUploader(config: UploaderConfig) {
  const transport = createFetchTransport(config);
  const core = createCoreUploader({
    openFile: (file: UploadFile) => {
      const source = file.sourceFile;
      if (!source) {
        throw new UploadError("A browser File or Blob source is required");
      }
      return Promise.resolve(createBlobReader(source));
    },
    partConcurrency: config.partConcurrency ?? 4,
    partRetries: config.partRetries ?? 3,
    put: transport.put,
    request: transport.request,
  });

  return {
    abort: core.abort,
    start: (file: File, options?: UploadOptions) =>
      core.start(toUploadFile(file), options),
    upload: (file: File, options?: UploadOptions): Promise<UploadedFile> =>
      core.upload(toUploadFile(file), options),
    uploadFiles: (files: File[], options?: UploadOptions) =>
      core.uploadFiles(files.map(toUploadFile), options),
  };
}

function toUploadFile(file: File): UploadFile {
  return {
    name: file.name,
    path: file.name || "upload",
    sourceFile: file,
  };
}

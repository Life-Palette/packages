import { File, FileMode } from "expo-file-system";
import { createUploader as createCoreUploader } from "../core/core-uploader";
import type { FileReaderAdapter } from "../core/file-reader";
import {
  type UploadCancellation,
  UploadError,
  type UploadFile,
} from "../core/types";

/** Opens an Expo local file as a lazy, range-readable upload source. */
export function createExpoFileReader(
  path: string,
  name: string
): FileReaderAdapter {
  const file = new File(path);
  const { size } = file;
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error("Unable to read media file size");
  }

  return {
    checksum: async (onProgress) => {
      onProgress?.(0);
      const checksum = await file.digest("MD5");
      onProgress?.(100);
      return checksum;
    },
    close: async () => undefined,
    name,
    read: async (start, end) => {
      const handle = file.open(FileMode.ReadOnly);
      try {
        handle.offset = start;
        const bytes = await handle.readBytes(end - start);
        if (bytes.byteLength !== end - start) {
          throw new Error("Media file read returned an incomplete range");
        }
        return bytes.buffer;
      } finally {
        handle.close();
      }
    },
    size,
  };
}

export interface ExpoUploaderConfig {
  apiBaseUrl: string;
  fetch?: typeof fetch;
  getToken: () => string | null;
  onCleanupError?: (error: unknown) => void;
  partConcurrency?: number;
  partRetries?: number;
  retryDelayMs?: number;
}

/** Expo file and fetch adapters over the shared upload protocol. */
export function createExpoUploader(config: ExpoUploaderConfig) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("A fetch implementation is required");
  }
  const baseUrl = config.apiBaseUrl.replace(/\/$/u, "");

  async function fetchRequest(
    url: string,
    init: RequestInit,
    cancellation?: UploadCancellation
  ) {
    const controller = new AbortController();
    const unsubscribe = cancellation?.subscribe(() => controller.abort());
    if (cancellation?.aborted) {
      controller.abort();
    }
    try {
      return await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (cancellation?.aborted) {
        cancellation.throwIfAborted();
      }
      throw error;
    } finally {
      unsubscribe?.();
    }
  }

  async function request<T>(
    path: string,
    method: "POST" | "DELETE",
    data?: unknown,
    cancellation?: UploadCancellation
  ): Promise<T> {
    const headers = new Headers({ Accept: "application/json" });
    const token = config.getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    if (data !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetchRequest(
      `${baseUrl}${path}`,
      {
        body: data === undefined ? undefined : JSON.stringify(data),
        headers,
        method,
      },
      cancellation
    );
    const text = await response.text();
    let body: {
      data?: T;
      details?: unknown;
      error?: string;
      message?: string;
    } = {};
    try {
      body = text ? (JSON.parse(text) as typeof body) : {};
    } catch {
      // Keep the HTTP status if the server returned a non-JSON body.
    }
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
    cancellation?: UploadCancellation
  ): Promise<string> {
    const headers = new Headers(suppliedHeaders);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/octet-stream");
    }
    const response = await fetchRequest(
      url,
      { body: data, headers, method: "PUT" },
      cancellation
    );
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

  return createCoreUploader({
    onCleanupError: config.onCleanupError,
    openFile: (file: UploadFile) =>
      Promise.resolve(createExpoFileReader(file.path, file.name ?? "media")),
    partConcurrency: config.partConcurrency,
    partRetries: config.partRetries,
    put,
    request,
    retryDelayMs: config.retryDelayMs,
  });
}

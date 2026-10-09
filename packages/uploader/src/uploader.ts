/**
 * Provider-neutral uploader for the Go API unified upload contract.
 *
 * Flow:
 *   POST /uploads
 *   PUT the returned presigned URL(s)
 *   POST /uploads/{id}/complete
 *
 * This is the sole uploader contract. Media analysis is performed by callers.
 */

import type { MediaAnalysisResult } from "@life-palette/media";
import { PromisePool, withRetry } from "./pool";

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

export interface UploadProgress {
  partNumber?: number;
  percent: number;
  stage: "md5" | "initializing" | "uploading" | "completing";
  totalParts?: number;
}

export interface UploadOptions {
  checksum?: string;
  isPrivate?: boolean;
  metadata?: MediaAnalysisResult;
  onProgress?: (progress: UploadProgress) => void;
  partConcurrency?: number;
  partRetries?: number;
}

export interface UploaderConfig {
  /** API base URL, for example: https://api.example.com/api/v1 */
  apiBaseUrl: string;
  /** Injectable fetch implementation for tests and custom runtimes. */
  fetch?: typeof fetch;
  /** Return the current access token without the Bearer prefix. */
  getToken: () => string | null;
  /** Default concurrent part uploads. */
  partConcurrency?: number;
  /** Default retry count per part. */
  partRetries?: number;
}

export interface UploadSession {
  content_type: string;
  existing_file?: UploadedFile;
  file_name: string;
  id: string;
  key: string;
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
    key: string;
    expires_at: number;
  };
  uploaded_parts?: UploadPart[];
}

export class UploadError extends Error {
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    options?: ErrorOptions & { status?: number; details?: unknown }
  ) {
    super(message, options);
    this.name = "UploadError";
    this.status = options?.status;
    this.details = options?.details;
  }
}

interface ApiResponse<T> {
  data?: T;
  details?: unknown;
  error?: string;
  message?: string;
}

function unwrap<T>(response: ApiResponse<T>): T {
  return response.data as T;
}

function getErrorMessage(body: ApiResponse<unknown>): string {
  return body.message || body.error || "Upload request failed";
}

export function createOssUploader(config: UploaderConfig) {
  const {
    apiBaseUrl,
    getToken,
    fetch: fetchImpl = globalThis.fetch,
    partConcurrency: defaultPartConcurrency = 4,
    partRetries: defaultPartRetries = 3,
  } = config;

  if (!fetchImpl) {
    throw new Error("A fetch implementation is required");
  }

  const request = async <T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> => {
    const token = getToken();
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    let response: Response;
    try {
      response = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers,
      });
    } catch (error) {
      throw new UploadError(
        `Upload request failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }

    const text = await response.text();
    let body: ApiResponse<T>;
    try {
      body = text ? (JSON.parse(text) as ApiResponse<T>) : {};
    } catch {
      body = {};
    }
    if (!response.ok) {
      throw new UploadError(getErrorMessage(body as ApiResponse<unknown>), {
        details: body.details,
        status: response.status,
      });
    }
    return unwrap(body);
  };

  const put = async (
    url: string,
    body: Blob,
    headers: Record<string, string> = {}
  ): Promise<string> => {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        body,
        headers,
        method: "PUT",
      });
    } catch (error) {
      throw new UploadError(
        `Object storage upload failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new UploadError(
        `Object storage upload failed: ${response.status}${detail ? ` - ${detail}` : ""}`,
        { status: response.status }
      );
    }
    const etag = response.headers.get("ETag")?.replace(/"/g, "") || "";
    return etag;
  };

  const initialize = async (
    file: File,
    checksum: string
  ): Promise<UploadSession> =>
    request<UploadSession>("/uploads", {
      body: JSON.stringify({
        checksum,
        file_name: file.name,
        size: file.size,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

  const complete = async (
    uploadId: string,
    parts: UploadPart[],
    isPrivate: boolean,
    metadata?: MediaAnalysisResult
  ): Promise<UploadedFile> =>
    request<UploadedFile>(`/uploads/${encodeURIComponent(uploadId)}/complete`, {
      body: JSON.stringify({
        is_private: isPrivate,
        parts,
        ...(metadata ? { metadata } : {}),
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

  const abort = (uploadId: string): Promise<unknown> =>
    request(`/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" });

  async function upload(file: File, options: UploadOptions = {}) {
    const {
      checksum: providedChecksum,
      metadata,
      isPrivate = false,
      partConcurrency = defaultPartConcurrency,
      partRetries = defaultPartRetries,
      onProgress,
    } = options;

    onProgress?.({ percent: 0, stage: "md5" });
    const checksum =
      providedChecksum ||
      metadata?.basic.md5 ||
      (await (await import("@life-palette/media")).hashBlob(file));
    onProgress?.({ percent: 100, stage: "md5" });

    onProgress?.({ percent: 0, stage: "initializing" });
    const session = await initialize(file, checksum);
    if (session.existing_file) {
      onProgress?.({ percent: 100, stage: "completing" });
      return session.existing_file;
    }
    onProgress?.({ percent: 100, stage: "initializing" });

    const parts: UploadPart[] = [...(session.uploaded_parts || [])];
    if (session.mode === "direct") {
      if (!session.upload) {
        throw new UploadError(
          "Direct upload session did not return an upload URL"
        );
      }
      await put(session.upload.url, file, session.upload.headers);
      onProgress?.({ percent: 100, stage: "uploading" });
    } else {
      if (!(session.part_size && session.parts)) {
        throw new UploadError("Multipart upload session is incomplete");
      }
      const partSize = session.part_size;
      const completedNumbers = new Set(parts.map((part) => part.part_number));
      const pending = session.parts.filter(
        (part) => !completedNumbers.has(part.part_number)
      );
      let uploaded = 0;
      const pool = new PromisePool(partConcurrency);
      await Promise.all(
        pending.map((part) =>
          pool.run(async () => {
            const start = (part.part_number - 1) * partSize;
            const blob = file.slice(
              start,
              Math.min(start + partSize, file.size)
            );
            const etag = await withRetry(
              () => put(part.url, blob, part.headers),
              partRetries
            );
            if (!etag) {
              throw new UploadError(
                `Part ${part.part_number} upload did not return an ETag; expose ETag in object storage CORS`
              );
            }
            parts.push({ etag, part_number: part.part_number });
            uploaded += 1;
            onProgress?.({
              partNumber: part.part_number,
              percent: Math.round((uploaded / pending.length) * 100),
              stage: "uploading",
              totalParts: session.total_parts,
            });
          })
        )
      );
      parts.sort((a, b) => a.part_number - b.part_number);
    }

    onProgress?.({ percent: 0, stage: "completing" });
    const result = await complete(session.id, parts, isPrivate, metadata);
    onProgress?.({ percent: 100, stage: "completing" });
    return result;
  }

  return { abort, upload };
}

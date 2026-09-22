/**
 * Provider-neutral uploader for the Go API unified upload contract.
 *
 * Flow:
 *   POST /uploads
 *   PUT the returned presigned URL(s)
 *   POST /uploads/{id}/complete
 *
 * This is intentionally separate from uploader.ts, which preserves the
 * legacy OSS policy-upload contract.
 */

import { hashBlob, type MediaAnalysisResult } from "@life-palette/media";
import { PromisePool, withRetry } from "./pool";

export interface UploadV2File {
  uid: string;
  name: string;
  type: string;
  file_md5: string;
  size: number;
  url: string;
  is_private: boolean;
  [key: string]: unknown;
}

export interface UploadV2Part {
  part_number: number;
  etag: string;
}

export interface UploadV2Progress {
  percent: number;
  stage: "md5" | "initializing" | "uploading" | "completing";
  partNumber?: number;
  totalParts?: number;
}

export interface UploadV2Options {
  checksum?: string;
  metadata?: MediaAnalysisResult;
  isPrivate?: boolean;
  partConcurrency?: number;
  partRetries?: number;
  onProgress?: (progress: UploadV2Progress) => void;
}

export interface UploadV2Config {
  /** API base URL, for example: https://api.example.com/api/v1 */
  apiBaseUrl: string;
  /** Return the current access token without the Bearer prefix. */
  getToken: () => string | null;
  /** Injectable fetch implementation for tests and custom runtimes. */
  fetch?: typeof fetch;
  /** Default concurrent part uploads. */
  partConcurrency?: number;
  /** Default retry count per part. */
  partRetries?: number;
}

export interface UploadV2Session {
  id: string;
  mode: "direct" | "multipart";
  key: string;
  file_name: string;
  content_type: string;
  size: number;
  part_size?: number;
  total_parts: number;
  uploaded_parts?: UploadV2Part[];
  upload?: {
    method: "PUT";
    url: string;
    headers?: Record<string, string>;
    key: string;
    expires_at: number;
  };
  parts?: Array<{
    part_number: number;
    url: string;
    headers?: Record<string, string>;
    expires_at: number;
  }>;
  existing_file?: UploadV2File;
}

export class UploadV2Error extends Error {
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "UploadV2Error";
    this.status = status;
    this.details = details;
  }
}

interface ApiResponse<T> {
  data?: T;
  result?: T;
  message?: string;
  error?: string;
  details?: unknown;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (response.data !== undefined) return response.data;
  if (response.result !== undefined) return response.result;
  return response as T;
}

function getErrorMessage(body: ApiResponse<unknown>): string {
  return body.message || body.error || "Upload request failed";
}

export function createUploaderV2(config: UploadV2Config) {
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
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers,
      });
    } catch (error) {
      throw new UploadV2Error(
        `Upload request failed: ${error instanceof Error ? error.message : String(error)}`
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
      throw new UploadV2Error(
        getErrorMessage(body as ApiResponse<unknown>),
        response.status,
        body.details
      );
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
        method: "PUT",
        headers,
        body,
      });
    } catch (error) {
      throw new UploadV2Error(
        `Object storage upload failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new UploadV2Error(
        `Object storage upload failed: ${response.status}${detail ? ` - ${detail}` : ""}`,
        response.status
      );
    }
    const etag = response.headers.get("ETag")?.replace(/"/g, "") || "";
    return etag;
  };

  const initialize = async (
    file: File,
    checksum: string
  ): Promise<UploadV2Session> =>
    request<UploadV2Session>("/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: file.name,
        size: file.size,
        checksum,
      }),
    });

  const complete = async (
    uploadId: string,
    parts: UploadV2Part[],
    isPrivate: boolean,
    metadata?: MediaAnalysisResult
  ): Promise<UploadV2File> =>
    request<UploadV2File>(`/uploads/${encodeURIComponent(uploadId)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parts,
        is_private: isPrivate,
        ...(metadata ? { metadata } : {}),
      }),
    });

  const abort = (uploadId: string): Promise<unknown> =>
    request(`/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" });

  async function upload(file: File, options: UploadV2Options = {}) {
    const {
      checksum: providedChecksum,
      metadata,
      isPrivate = false,
      partConcurrency = defaultPartConcurrency,
      partRetries = defaultPartRetries,
      onProgress,
    } = options;

    onProgress?.({ percent: 0, stage: "md5" });
    const checksum = providedChecksum || metadata?.basic.md5 || (await hashBlob(file));
    onProgress?.({ percent: 100, stage: "md5" });

    onProgress?.({ percent: 0, stage: "initializing" });
    const session = await initialize(file, checksum);
    if (session.existing_file) {
      onProgress?.({ percent: 100, stage: "completing" });
      return session.existing_file;
    }
    onProgress?.({ percent: 100, stage: "initializing" });

    const parts: UploadV2Part[] = [...(session.uploaded_parts || [])];
    if (session.mode === "direct") {
      if (!session.upload) {
        throw new UploadV2Error("Direct upload session did not return an upload URL");
      }
      await put(session.upload.url, file, session.upload.headers);
      onProgress?.({ percent: 100, stage: "uploading" });
    } else {
      if (!session.part_size || !session.parts) {
        throw new UploadV2Error("Multipart upload session is incomplete");
      }
      const completedNumbers = new Set(parts.map((part) => part.part_number));
      const pending = session.parts.filter(
        (part) => !completedNumbers.has(part.part_number)
      );
      let uploaded = 0;
      const pool = new PromisePool(partConcurrency);
      await Promise.all(
        pending.map((part) =>
          pool.run(async () => {
            const start = (part.part_number - 1) * session.part_size!;
            const blob = file.slice(
              start,
              Math.min(start + session.part_size!, file.size)
            );
            const etag = await withRetry(
              () => put(part.url, blob, part.headers),
              partRetries
            );
            if (!etag) {
              throw new UploadV2Error(
                `Part ${part.part_number} upload did not return an ETag; expose ETag in object storage CORS`
              );
            }
            parts.push({ part_number: part.part_number, etag });
            uploaded += 1;
            onProgress?.({
              percent: Math.round((uploaded / pending.length) * 100),
              stage: "uploading",
              partNumber: part.part_number,
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

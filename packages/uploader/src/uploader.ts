/**
 * OSS Uploader — pure factory with no framework dependency.
 *
 * Pipeline: compress(optional) → analyze → init(秒传检查) → upload parts → complete.
 * Concurrent multipart upload with per-part retry; live-photo association runs after batch.
 */

import {
  analyzeMedia,
  hashBlob,
  type AnalyzeMediaOptions,
  type MediaAnalysisResult,
} from "@life-palette/media";
import { PromisePool, withRetry } from "./pool";
import { detectLivePhotoPairs } from "./live-photo";

// ============ 类型 ============

export interface OSSFile {
  address?: string;
  arthash?: string;
  arthash_codec?: string;
  blurhash?: string;
  created_at: string;
  file_md5: string;
  height?: number;
  is_private: boolean;
  live_photo_video_id?: number;
  live_photo_video_sec_uid?: string;
  name: string;
  sec_uid: string;
  size: number;
  taken_at?: string;
  type: string;
  updated_at: string;
  url: string;
  width?: number;
  colors?: unknown[];
}

export interface UploadToken {
  accessid: string;
  dir: string;
  expire: number;
  host: string;
  key: string;
  policy: string;
  signature: string;
}

export interface CompletePart {
  etag: string;
  part_number: number;
}

export type UploadStage =
  | "compress"
  | "analyze"
  | "md5"
  | "upload"
  | "complete";

export interface UploadProgress {
  percent: number;
  stage: UploadStage;
}

export interface UploadOptions {
  /** 压缩图片 */
  compress?: boolean;
  /** 是否私有 */
  isPrivate?: boolean;
  /** 手动地理位置（经纬度） */
  location?: { lat: number; lng: number };
  /** 最大文件大小 MB（压缩用） */
  maxSizeMB?: number;
  /** 是否在上传前执行浏览器端媒体分析，默认 true */
  analyze?: boolean;
  /** 媒体分析参数 */
  analysis?: Omit<AnalyzeMediaOptions, "onProgress">;
  /** 已经计算好的分析结果，可避免上传前重复分析 */
  precomputedAnalysis?: MediaAnalysisResult;
  /** 进度回调 */
  onProgress?: (progress: UploadProgress) => void;
}

/** 仅上传文件到 OSS，不创建 DB 记录 */
export interface UploadToOSSResult {
  file_name: string;
  file_size: number;
  key: string;
  md5: string;
  parts?: CompletePart[];
  upload_id?: string;
}

export interface UploaderConfig {
  /** API 基础路径，如 https://api.lpalette.cn/api/v1 */
  apiBaseUrl: string;
  /** 分片大小（字节），默认 5MB */
  chunkSize?: number;
  /** 获取 token 的函数 */
  getToken: () => string | null;
  /** 分片阈值（字节），默认 5MB */
  multipartThreshold?: number;
  /** 分片并发数，默认 4 */
  partConcurrency?: number;
  /** 单片失败重试次数，默认 3 */
  partRetries?: number;
  /** 带浏览器 metadata 的完成接口，默认 /file/upload/complete */
  completeEndpoint?: string;
}

// ============ 内部类型 ============

interface InitExistsResponse {
  exists: true;
  file: OSSFile;
}
interface InitSimpleResponse {
  exists: false;
  mode: "simple";
  token: UploadToken;
}
interface InitMultipartResponse {
  chunk_size: number;
  exists: false;
  host: string;
  key: string;
  mode: "multipart";
  total_parts: number;
  upload_id: string;
  uploaded_parts: number[];
  uploaded_part_etags?: CompletePart[];
}
type InitResponse = InitExistsResponse | InitSimpleResponse | InitMultipartResponse;

interface UploadUrlEntry {
  part_number: number;
  url: string;
}

// ============ 工厂函数 ============

const RE_HOST_PREFIX = /^https?:\/\/[^/]+\//;

export function createOssUploader(config: UploaderConfig) {
  const {
    apiBaseUrl,
    getToken,
    multipartThreshold = 5 * 1024 * 1024,
    chunkSize = 5 * 1024 * 1024,
    partConcurrency = 4,
    partRetries = 3,
    completeEndpoint = "/file/upload/complete",
  } = config;

  // --- HTTP 工具 ---

  async function request<T>(
    endpoint: string,
    method: "POST" | "PUT",
    body: unknown
  ): Promise<T> {
    const token = getToken();
    const res = await fetch(`${apiBaseUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || (data.code && data.code >= 400)) {
      throw new Error(data.message || data.msg || "请求失败");
    }
    return data.data ?? data.result;
  }

  // --- API 层 ---

  function initUpload(
    fileName: string,
    fileSize: number,
    md5: string,
    chunk?: number
  ) {
    const body: Record<string, unknown> = {
      file_name: fileName,
      file_size: fileSize,
      md5,
    };
    if (chunk) {
      body.chunk_size = chunk;
    }
    return request<InitResponse>("/file/upload/init", "POST", body);
  }

  function completeUpload(data: {
    key: string;
    md5: string;
    file_name: string;
    file_size: number;
    is_private?: boolean;
    lat?: number;
    lng?: number;
    metadata: MediaAnalysisResult;
    upload_id?: string;
    parts?: CompletePart[];
  }) {
    return request<OSSFile>(completeEndpoint, "POST", data);
  }

  function getPartUrls(key: string, uploadId: string, partNumbers: number[]) {
    return request<{ urls: UploadUrlEntry[] }>(
      "/file/upload/urls",
      "POST",
      { key, upload_id: uploadId, part_numbers: partNumbers }
    );
  }

  // --- 图片压缩 ---

  async function compress(file: File, maxSizeMB = 1): Promise<File> {
    if (!file.type.startsWith("image/")) {
      return file;
    }
    try {
      const { default: imageCompression } = await import(
        "browser-image-compression"
      );
      const compressed = await imageCompression(file, {
        maxSizeMB,
        useWebWorker: true,
        preserveExif: true,
      });
      return compressed.name
        ? compressed
        : new File([compressed], file.name, {
            type: compressed.type || file.type,
          });
    } catch {
      return file;
    }
  }

  // --- 普通上传（FormData 到 OSS） ---

  function simpleUpload(
    token: UploadToken,
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<void> {
    const fd = new FormData();
    fd.append("key", token.key);
    fd.append("policy", token.policy);
    fd.append("OSSAccessKeyId", token.accessid);
    fd.append("signature", token.signature);
    fd.append("success_action_status", "200");
    fd.append("file", file);

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress?.(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () =>
        xhr.status === 200
          ? resolve()
          : reject(new Error(`OSS 上传失败: ${xhr.status}`));
      xhr.onerror = () => reject(new Error("OSS 上传失败"));
      xhr.open("POST", token.host);
      xhr.send(fd);
    });
  }

  // --- 单片上传（带 Content-Type + 重试） ---

  async function uploadPart(
    part: { partNumber: number; url: string; blob: Blob }
  ): Promise<CompletePart> {
    return withRetry(async () => {
      const res = await fetch(part.url, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: part.blob,
      });
      if (!res.ok) {
        throw new Error(`Failed to upload part ${part.partNumber}: ${res.status}`);
      }
      const etag = res.headers.get("ETag") || "";
      return {
        part_number: part.partNumber,
        etag: etag.replace(/"/g, ""),
      };
    }, partRetries);
  }

  // --- 分片上传（并发 + 重试） ---

  async function multipartUpload(
    file: File,
    md5: string,
    metadata: MediaAnalysisResult,
    isPrivate?: boolean,
    location?: { lat: number; lng: number },
    onProgress?: (pct: number) => void
  ): Promise<OSSFile> {
    const init = await initUpload(file.name, file.size, md5, chunkSize);
    if (init.exists) {
      onProgress?.(100);
      return init.file;
    }
    if (init.mode !== "multipart") {
      throw new Error("Unexpected upload mode");
    }

    const {
      upload_id: uid,
      key,
      uploaded_parts: done = [],
      uploaded_part_etags: existingParts = [],
      total_parts: total,
    } = init;
    const doneSet = new Set(done);
    const pending = Array.from({ length: total }, (_, i) => i + 1).filter(
      (n) => !doneSet.has(n)
    );

    const parts: CompletePart[] = [...existingParts];
    let uploaded = 0;

    if (pending.length > 0) {
      const { urls } = await getPartUrls(key, uid, pending);
      const urlMap = new Map(urls.map((u) => [u.part_number, u.url]));

      const pool = new PromisePool(partConcurrency);
      const tasks = pending.map<() => Promise<void>>((partNumber) => {
        const url = urlMap.get(partNumber);
        if (!url) {
          throw new Error(`No URL for part ${partNumber}`);
        }
        const start = (partNumber - 1) * chunkSize;
        const blob = file.slice(
          start,
          Math.min(start + chunkSize, file.size)
        );
        return () =>
          uploadPart({ partNumber, url, blob }).then((part) => {
            parts.push(part);
            uploaded += 1;
            onProgress?.(Math.round((uploaded / pending.length) * 100));
          });
      });

      await Promise.all(tasks.map((t) => pool.run(t)));
    }

    parts.sort((a, b) => a.part_number - b.part_number);
    onProgress?.(100);

    return completeUpload({
      key,
      upload_id: uid,
      md5,
      file_name: file.name,
      file_size: file.size,
      parts,
      is_private: isPrivate,
      ...(location ? { lat: location.lat, lng: location.lng } : {}),
      metadata,
    });
  }

  // ============ 公开 API ============

  /**
   * 仅上传文件到 OSS，不调用 completeUpload（不创建 DB 记录）
   */
  async function uploadToOSS(
    file: File,
    options: UploadOptions = {}
  ): Promise<UploadToOSSResult> {
    const { compress: shouldCompress = false, maxSizeMB, onProgress } = options;
    let processed = file;

    if (shouldCompress && file.type.startsWith("image/")) {
      onProgress?.({ stage: "compress", percent: 0 });
      processed = await compress(file, maxSizeMB);
      onProgress?.({ stage: "compress", percent: 100 });
    }

    onProgress?.({ stage: "md5", percent: 0 });
    const md5 = await hashBlob(processed);
    onProgress?.({ stage: "md5", percent: 100 });

    onProgress?.({ stage: "upload", percent: 0 });
    const init = await initUpload(
      processed.name,
      processed.size,
      md5,
      processed.size >= multipartThreshold ? chunkSize : undefined
    );

    if (init.exists) {
      onProgress?.({ stage: "complete", percent: 100 });
      return {
        key: init.file.url.replace(RE_HOST_PREFIX, ""),
        md5: init.file.file_md5,
        file_name: processed.name,
        file_size: processed.size,
      };
    }

    if (init.mode === "simple") {
      await simpleUpload(init.token, processed, (pct) =>
        onProgress?.({ stage: "upload", percent: pct })
      );
      onProgress?.({ stage: "complete", percent: 100 });
      return {
        key: init.token.key,
        md5,
        file_name: processed.name,
        file_size: processed.size,
      };
    }

    // 分片上传 — 复用 multipartUpload 但跳过 complete
    const { upload_id: uid, key, uploaded_parts: done = [] } = init;
    const doneSet = new Set(done);
    const pending = Array.from(
      { length: init.total_parts },
      (_, i) => i + 1
    ).filter((n) => !doneSet.has(n));

    const parts: CompletePart[] = [];
    if (pending.length > 0) {
      const { urls } = await getPartUrls(key, uid, pending);
      const urlMap = new Map(urls.map((u) => [u.part_number, u.url]));
      const pool = new PromisePool(partConcurrency);
      const tasks = pending.map<() => Promise<CompletePart>>((partNumber) => {
        const url = urlMap.get(partNumber);
        if (!url) {
          throw new Error(`No URL for part ${partNumber}`);
        }
        const start = (partNumber - 1) * chunkSize;
        const blob = processed.slice(
          start,
          Math.min(start + chunkSize, processed.size)
        );
        return () => uploadPart({ partNumber, url, blob });
      });
      const collected = await Promise.all(tasks.map((t) => pool.run(t)));
      collected.sort((a, b) => a.part_number - b.part_number);
      parts.push(...collected);
    }

    onProgress?.({ stage: "complete", percent: 100 });
    return {
      key,
      md5,
      file_name: processed.name,
      file_size: processed.size,
      upload_id: uid,
      parts,
    };
  }

  /**
   * 上传单个文件（完整流程：压缩 → 分析 → MD5 → OSS → complete）。
   */
  async function upload(
    file: File,
    options: UploadOptions = {}
  ): Promise<OSSFile> {
    const {
      compress: shouldCompress = false,
      maxSizeMB,
      isPrivate,
      location,
      onProgress,
      analyze: shouldAnalyze = true,
      analysis: analysisOptions,
      precomputedAnalysis,
    } = options;
    let processed = file;

    if (shouldCompress && file.type.startsWith("image/")) {
      onProgress?.({ stage: "compress", percent: 0 });
      processed = await compress(file, maxSizeMB);
      onProgress?.({ stage: "compress", percent: 100 });
    }

    let metadata: MediaAnalysisResult | undefined;
    let md5: string;
    if (precomputedAnalysis) {
      metadata = precomputedAnalysis;
      md5 = metadata.basic.md5;
      if (!md5) {
        throw new Error("预计算媒体分析结果缺少 MD5");
      }
    } else if (shouldAnalyze) {
      onProgress?.({ stage: "analyze", percent: 0 });
      metadata = await analyzeMedia(processed, {
        ...analysisOptions,
        onProgress: ({ stage, percent }) => {
          if (stage === "md5") {
            onProgress?.({ stage: "analyze", percent: Math.round(percent * 0.35) });
          } else if (stage === "decode") {
            onProgress?.({ stage: "analyze", percent: 35 + Math.round(percent * 0.35) });
          } else {
            onProgress?.({ stage: "analyze", percent: 70 + Math.round(percent * 0.3) });
          }
        },
      });
      md5 = metadata.basic.md5;
    } else {
      onProgress?.({ stage: "md5", percent: 0 });
      md5 = await hashBlob(processed);
      metadata = {
        schema_version: 1,
        basic: {
          name: processed.name,
          type: processed.type,
          extension: processed.name.includes(".")
            ? processed.name.slice(processed.name.lastIndexOf("."))
            : "",
          size: processed.size,
          md5,
        },
      };
    }

    if (!metadata) {
      throw new Error("媒体 metadata 生成失败");
    }

    onProgress?.({ stage: "upload", percent: 0 });
    const result =
      processed.size >= multipartThreshold
        ? await multipartUpload(
            processed,
            md5,
            metadata,
            isPrivate,
            location,
            (pct) => onProgress?.({ stage: "upload", percent: pct })
          )
        : await simpleUploadWithComplete(
            processed,
            md5,
            metadata,
            isPrivate,
            location,
            (pct) => onProgress?.({ stage: "upload", percent: pct })
          );

    onProgress?.({ stage: "complete", percent: 100 });
    return result;
  }

  // simpleUpload + completeUpload 的小封装，避免分支里塞一坨代码
  async function simpleUploadWithComplete(
    file: File,
    md5: string,
    metadata: MediaAnalysisResult,
    isPrivate?: boolean,
    location?: { lat: number; lng: number },
    onProgress?: (pct: number) => void
  ): Promise<OSSFile> {
    onProgress?.(10);
    const init = await initUpload(file.name, file.size, md5);
    if (init.exists) {
      onProgress?.(100);
      return init.file;
    }
    if (init.mode !== "simple") {
      throw new Error("Unexpected upload mode");
    }

    onProgress?.(30);
    await simpleUpload(init.token, file, (pct) =>
      onProgress?.(30 + Math.round(pct * 0.55))
    );

    onProgress?.(90);
    return completeUpload({
      key: init.token.key,
      md5,
      file_name: file.name,
      file_size: file.size,
      is_private: isPrivate,
      ...(location ? { lat: location.lat, lng: location.lng } : {}),
      metadata,
    });
  }

  // --- 实况照片关联 ---

  async function associateLivePhotos(results: OSSFile[]): Promise<OSSFile[]> {
    const associatedResults = [...results];
    for (const { image, video } of detectLivePhotoPairs(results)) {
      if (!image || !video) {
        continue;
      }
      try {
        const updatedImage = await request<OSSFile>(
          `/file/${image.sec_uid}`,
          "PUT",
          { live_photo_video_sec_uid: video.sec_uid }
        );
        const imageIndex = associatedResults.findIndex(
          (item) => item.sec_uid === image.sec_uid
        );
        if (imageIndex >= 0) {
          associatedResults[imageIndex] = {
            ...associatedResults[imageIndex],
            ...updatedImage,
            live_photo_video_sec_uid: video.sec_uid,
          };
        }
      } catch (e) {
        console.error("实况照片关联失败:", e);
      }
    }
    return associatedResults;
  }

  /**
   * 批量上传（并发，带重试），上传完成后自动关联实况照片
   */
  async function uploadBatch(
    files: File[],
    options: UploadOptions = {},
    concurrency = 2,
    maxRetries = 3
  ): Promise<OSSFile[]> {
    const pool = new PromisePool(concurrency);
    const settled = await Promise.allSettled(
      files.map((file) =>
        pool.run(async () => {
          let lastErr: Error | null = null;
          for (let attempt = 0; attempt < maxRetries; attempt += 1) {
            try {
              return await upload(file, options);
            } catch (e) {
              lastErr = e as Error;
              if (attempt < maxRetries - 1) {
                await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
              }
            }
          }
          throw lastErr;
        })
      )
    );

    const successes: OSSFile[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        successes.push(result.value);
      } else {
        console.error("文件上传失败:", result.reason);
      }
    }
    return associateLivePhotos(successes);
  }

  return { upload, uploadBatch, uploadToOSS, associateLivePhotos };
}

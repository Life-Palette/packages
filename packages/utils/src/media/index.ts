/**
 * 媒体文件 URL 处理（OSS 图片/视频）
 */

/** HEIC 等需要 OSS 转格式的扩展名 */
const NEED_FORMAT_EXTS = [".heic", ".heif"];

/** 视频扩展名 */
const VIDEO_EXTS = ["mov", "mp4", "avi", "mkv", "webm", "m4v"];

// ─── 类型 ────────────────────────────────────────────────

export interface FileData {
  cover?: string;
  extension?: string;
  live_photo_video?: {
    url?: string;
    video_variants?: Array<{ quality?: string; url?: string }>;
  };
  type?: string;
  url?: string;
  [key: string]: unknown;
}

export interface FileParseOptions {
  format?: string;
  resize?: number;
}

export interface FileParseResult extends FileData {
  baseSrc: string;
  cover: string;
  fileType: "IMAGE" | "VIDEO";
  thumbnailUrl: string;
  videoSrc: string;
}

// ─── 核心方法 ────────────────────────────────────────────

/**
 * 从 live_photo_video.video_variants 中取 1080p，兜底取原始 url
 */
function getLivePhotoVideoUrl(file: FileData): string {
  const lv = file?.live_photo_video;
  if (!lv) {
    return "";
  }
  const variants = lv.video_variants;
  if (Array.isArray(variants) && variants.length) {
    const v1080 = variants.find((v) => v.quality === "1080p");
    if (v1080?.url) {
      return v1080.url;
    }
  }
  return lv.url || "";
}

/**
 * 解析文件数据，生成展示所需的 URL
 * - IMAGE: thumbnailUrl（缩略图）、baseSrc（原图/转格式）、videoSrc（实况视频）
 * - VIDEO: cover（封面截图）
 */
export function fileParse(
  data: FileData,
  options?: FileParseOptions
): FileParseResult {
  const { url = "", type = "" } = data || {};
  const fileType = type.toUpperCase().includes("VIDEO") ? "VIDEO" : "IMAGE";
  const { format = "jpg", resize = 400 } = options || {};

  let baseSrc = "";
  let thumbnailUrl = "";
  let cover = "";
  let videoSrc = "";

  if (fileType === "IMAGE") {
    const ext = (
      (data?.extension as string) ||
      url.slice(Math.max(0, url.lastIndexOf(".")))
    ).toLowerCase();
    const needFormat = NEED_FORMAT_EXTS.some((e) => ext.includes(e));

    if (needFormat) {
      baseSrc = `${url}?x-oss-process=image/format,${format}`;
      thumbnailUrl = `${url}?x-oss-process=image/resize,l_${resize}/format,${format}`;
    } else {
      baseSrc = url;
      thumbnailUrl = `${url}?x-oss-process=image/resize,l_${resize}`;
    }

    videoSrc = getLivePhotoVideoUrl(data);
  } else {
    cover =
      (data?.cover as string) ||
      `${url}?x-oss-process=video/snapshot,t_7000,f_${format},w_0,h_0,m_fast`;
  }

  return {
    ...data,
    fileType,
    baseSrc,
    thumbnailUrl,
    cover,
    videoSrc,
  } as FileParseResult;
}

/**
 * 判断文件是否为视频
 */
export function isVideo(file: { type?: string }): boolean {
  return !!file.type?.startsWith("video/");
}

/**
 * 判断文件是否为实况照片（有 videoSrc 但本身不是视频）
 */
export function isLivePhoto(file: {
  type?: string;
  videoSrc?: string | null;
}): boolean {
  return !!(file.videoSrc && !isVideo(file));
}

/**
 * 生成 OSS 视频截帧 URL
 */
export function getVideoThumbnailUrl(videoUrl: string): string {
  return `${videoUrl}?x-oss-process=video/snapshot,t_1000,f_jpg,w_0,h_0,m_fast`;
}

/**
 * 生成 OSS 图片处理参数（resize + quality + webp）
 */
export function generateOssImageParams(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  quality = 10
): string {
  if (!(originalWidth && originalHeight)) {
    return `?x-oss-process=image/resize,w_${targetWidth},m_lfit/quality,q_${quality}/format,webp`;
  }
  const targetHeight = Math.round(
    (originalHeight / originalWidth) * targetWidth
  );
  return `?x-oss-process=image/resize,w_${targetWidth},h_${targetHeight},m_lfit/quality,q_${quality}/format,webp`;
}

/**
 * 解析文件名 → baseName + ext + isVideo
 */
export function parseFileName(fileName: string): {
  baseName: string;
  ext: string;
  isVideo: boolean;
} {
  const parts = fileName.split(".");
  const ext = (parts.pop() || "").toLowerCase();
  const baseName = parts.join(".");
  return { baseName, ext, isVideo: VIDEO_EXTS.includes(ext) };
}

/**
 * 检测文件列表中的 Live Photo 配对（同名 image + video）
 */
export function detectLivePhotoPairs<T extends { name: string; type?: string }>(
  files: T[]
): Array<{ image: T; video: T }> {
  const pairs: Array<{ image: T; video: T }> = [];
  const usedIndices = new Set<number>();

  files.forEach((file, idx) => {
    const { baseName, isVideo: isVid } = parseFileName(file.name);
    if (!isVid) {
      return;
    }

    const imageIdx = files.findIndex((f, i) => {
      if (i === idx || usedIndices.has(i)) {
        return false;
      }
      const info = parseFileName(f.name);
      return info.baseName === baseName && !info.isVideo;
    });

    if (imageIdx !== -1) {
      pairs.push({ image: files[imageIdx], video: file });
      usedIndices.add(imageIdx);
      usedIndices.add(idx);
    }
  });

  return pairs;
}

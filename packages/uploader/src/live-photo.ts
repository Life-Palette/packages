/**
 * Live Photo pairing utilities.
 */

import { parseFileName } from "./file-url";

/**
 * 检测文件列表中的 Live Photo 配对（同名 image + video）。
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
      const image = files[imageIdx];
      if (!image) {
        return;
      }
      pairs.push({ image, video: file });
      usedIndices.add(imageIdx);
      usedIndices.add(idx);
    }
  });

  return pairs;
}

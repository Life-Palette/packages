/**
 * Browser-side MD5 hashing (lazy-loaded).
 *
 * spark-md5 是纯 JS 实现，体积小；动态导入让 bundler 不把它打进 dist，
 * consumer 必须把它列为 `peerDependency` 或 `optionalDependencies`。
 */

const CHUNK_SIZE = 2 * 1024 * 1024;

export interface HashProgress {
  loaded: number;
  percent: number;
  total: number;
}

/**
 * 计算 Blob/File 的 MD5 摘要（hex string）。
 * 静态方法，便于在 Worker / OffscreenCanvas 等环境调用。
 */
export async function hashBlob(
  blob: Blob,
  onProgress?: (progress: HashProgress) => void
): Promise<string> {
  if (typeof blob === "undefined" || blob.size === undefined) {
    throw new TypeError("hashBlob 需要传入 Blob 或 File");
  }

  const { default: SparkMD5 } = await import("spark-md5");
  const hash = new SparkMD5.ArrayBuffer();
  const total = Math.max(1, Math.ceil(blob.size / CHUNK_SIZE));

  for (let index = 0; index < total; index += 1) {
    const start = index * CHUNK_SIZE;
    const buffer = await blob
      .slice(start, Math.min(start + CHUNK_SIZE, blob.size))
      .arrayBuffer();
    hash.append(buffer);
    onProgress?.({
      loaded: index + 1,
      percent: Math.round(((index + 1) / total) * 100),
      total,
    });
  }

  return hash.end();
}

import { getUni, nativeCall } from "./transport";
import {
  type FileSystem,
  type UniPlatform,
  type UniRuntime,
  UploadError,
  type UploadFile,
} from "./types";

export interface FileReaderAdapter {
  checksum: (onProgress?: (percent: number) => void) => Promise<string>;
  close: () => Promise<void>;
  name: string;
  read: (start: number, end: number) => Promise<ArrayBuffer>;
  size: number;
}

/** Supply an adapter for runtimes without the native filesystem/HTML5+ APIs. */
export interface FileConfig {
  /** Adapter for native platforms without binary filesystem writes. */
  createTempFile?: (data: ArrayBuffer) => Promise<TemporaryFile>;
  /** Report cleanup failures without replacing the primary result. */
  onCleanupError?: (error: unknown) => void;
  openFile?: (file: UploadFile) => Promise<FileReaderAdapter>;
  platform: UniPlatform;
  tempDirectory?: string;
  uni?: UniRuntime;
}

export interface UploadFileInfo {
  md5: string;
  name: string;
  path: string;
  size: number;
}

export interface ChunkRange {
  /** Exclusive byte offset. */
  end: number;
  /** One-based, suitable for common multipart upload APIs. */
  partNumber: number;
  size: number;
  start: number;
}

export interface FileChunk extends ChunkRange {
  /** Reads only this chunk. These are binary bytes, not a temporary file path. */
  read: () => Promise<ArrayBuffer>;
  /** Caller owns dispose(); split.close() also disposes remaining temporary files. */
  toFile: () => Promise<TemporaryFile>;
}

/** Pure partitioning, independent of uni runtime or any server protocol. */
export function getChunkRanges(size: number, chunkSize: number): ChunkRange[] {
  if (
    !Number.isSafeInteger(size) ||
    size < 0 ||
    !Number.isSafeInteger(chunkSize) ||
    chunkSize < 1
  ) {
    throw new UploadError(
      "File size must be a nonnegative integer and chunkSize must be a positive integer"
    );
  }
  return Array.from({ length: Math.ceil(size / chunkSize) }, (_, index) => {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, size);
    return { end, partNumber: index + 1, size: end - start, start };
  });
}

/** Standalone file information; opens no upload session and makes no server requests. */
export async function getFileInfo(
  input: UploadFile | string,
  config: FileConfig,
  onProgress?: (percent: number) => void
): Promise<UploadFileInfo> {
  const file = typeof input === "string" ? { path: input } : input;
  const reader = await openUploadFile(file, config);
  try {
    return {
      md5: await reader.checksum(onProgress),
      name: reader.name,
      path: file.path,
      size: reader.size,
    };
  } finally {
    await cleanup(reader.close, config);
  }
}

/** Lazy chunks for another system's custom upload flow. Always close in finally. */
export async function splitFile(
  input: UploadFile | string,
  config: FileConfig & { chunkSize: number }
) {
  const file = typeof input === "string" ? { path: input } : input;
  // Validate before opening native resources.
  getChunkRanges(0, config.chunkSize);
  const reader = await openUploadFile(file, config);
  let closed = false;
  let closing: Promise<void> | undefined;
  const temporary = new Set<TemporaryFile>();
  const materializing = new Set<Promise<TemporaryFile>>();
  try {
    const chunks: FileChunk[] = getChunkRanges(
      reader.size,
      config.chunkSize
    ).map((range) => ({
      ...range,
      read: async () => {
        if (closed) {
          throw new UploadError("File chunks have been closed");
        }
        const data = await reader.read(range.start, range.end);
        if (!(data instanceof ArrayBuffer) || data.byteLength !== range.size) {
          throw new UploadError("File reader returned an invalid byte range");
        }
        return data;
      },
      toFile: () => {
        if (closed) {
          return Promise.reject(
            new UploadError("File chunks have been closed")
          );
        }
        const pending = reader
          .read(range.start, range.end)
          .then(async (data) => {
            const temp = await createTemporaryFile(data, config);
            const owned = {
              dispose: async () => {
                await temp.dispose();
                temporary.delete(owned);
              },
              file: temp.file,
            };
            temporary.add(owned);
            return owned;
          });
        materializing.add(pending);
        pending.then(
          () => materializing.delete(pending),
          () => materializing.delete(pending)
        );
        return pending;
      },
    }));
    return {
      /** Optional digest, independent of splitting. */
      checksum: (progress?: (percent: number) => void) => {
        if (closed) {
          return Promise.reject(
            new UploadError("File chunks have been closed")
          );
        }
        return reader.checksum(progress);
      },
      chunks,
      close: () => {
        if (!closing) {
          closed = true;
          closing = (async () => {
            await Promise.allSettled([...materializing]);
            await Promise.all(
              [...temporary].map((temp) => cleanup(temp.dispose, config))
            );
            await cleanup(reader.close, config);
          })();
        }
        return closing;
      },
      name: reader.name,
      size: reader.size,
      totalParts: chunks.length,
    };
  } catch (error) {
    await reader.close().catch(() => undefined);
    throw error;
  }
}

interface PlusFile {
  close: () => void;
  name: string;
  size: number;
  slice: (start: number, end: number) => PlusFile;
}

interface PlusIO {
  FileReader: new () => {
    result: string;
    onload: (() => void) | null;
    onerror: ((error: unknown) => void) | null;
    readAsDataURL: (file: PlusFile) => void;
  };
  resolveLocalFileSystemURL: (
    path: string,
    success: (entry: {
      file: (
        success: (file: PlusFile) => void,
        fail: (error: unknown) => void
      ) => void;
    }) => void,
    fail: (error: unknown) => void
  ) => void;
}

declare const plus: { io: PlusIO };

function fileName(file: UploadFile): string {
  return (
    file.name ||
    file.sourceFile?.name ||
    file.path.split(/[\\/]/).pop()?.split(/[?#]/)[0] ||
    "file"
  );
}

async function hash(
  reader: Pick<FileReaderAdapter, "size" | "read">,
  onProgress?: (percent: number) => void
): Promise<string> {
  const { default: SparkMD5 } = await import("spark-md5");
  const digest = new SparkMD5.ArrayBuffer();
  const chunkSize = 2 * 1024 * 1024;
  if (reader.size === 0) {
    onProgress?.(100);
  }
  for (let start = 0; start < reader.size; start += chunkSize) {
    const end = Math.min(start + chunkSize, reader.size);
    digest.append(await reader.read(start, end));
    onProgress?.(Math.round((end / reader.size) * 100));
  }
  return digest.end();
}

async function openH5(
  file: UploadFile,
  config: FileConfig
): Promise<FileReaderAdapter> {
  let source: Blob | ArrayBuffer;
  if (file.sourceFile) {
    source = file.sourceFile;
  } else {
    const api = getUni(config.uni);
    const response = await nativeCall<{
      data: unknown;
      statusCode: number;
      header: Record<string, unknown>;
    }>((callbacks) =>
      api.request({
        ...callbacks,
        dataType: "text",
        header: {},
        method: "GET",
        responseType: "arraybuffer",
        timeout: 60_000,
        url: file.path,
      })
    );
    if (
      response.statusCode < 200 ||
      response.statusCode >= 300 ||
      !(response.data instanceof ArrayBuffer)
    ) {
      throw new UploadError(
        "uni.request could not read the H5 file URL; retain chooseImage's sourceFile"
      );
    }
    source = response.data;
  }
  const reader: FileReaderAdapter = {
    checksum: (progress) => hash(reader, progress),
    close: async () => undefined,
    name: fileName(file),
    read: async (start, end) =>
      source instanceof ArrayBuffer
        ? source.slice(start, end)
        : source.slice(start, end).arrayBuffer(),
    size: source instanceof ArrayBuffer ? source.byteLength : source.size,
  };
  return reader;
}

async function openPlus(
  file: UploadFile,
  api: UniRuntime
): Promise<Pick<FileReaderAdapter, "read" | "close" | "size">> {
  const io = typeof plus === "undefined" ? undefined : plus.io;
  if (!(io && api.base64ToArrayBuffer)) {
    throw new UploadError(
      "App file reading requires HTML5+ and uni.base64ToArrayBuffer, or an openFile adapter"
    );
  }
  const decode = api.base64ToArrayBuffer.bind(api);
  const source = await new Promise<PlusFile>((resolve, reject) => {
    io.resolveLocalFileSystemURL(
      file.path,
      (entry) => entry.file(resolve, reject),
      reject
    );
  });
  return {
    close: async () => source.close(),
    read: (start, end) =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        if (start === end) {
          resolve(new ArrayBuffer(0));
          return;
        }
        const chunk = source.slice(start, end);
        let released = false;
        const release = () => {
          if (released) {
            return;
          }
          released = true;
          try {
            chunk.close();
          } catch {
            /* Preserve the read result. */
          }
        };
        try {
          const reader = new io.FileReader();
          reader.onerror = (error) => {
            release();
            reject(new UploadError("App file read failed", { cause: error }));
          };
          reader.onload = () => {
            try {
              const comma = reader.result.indexOf(",");
              if (comma < 0) {
                throw new UploadError("Invalid native file data URL");
              }
              resolve(decode(reader.result.slice(comma + 1)));
            } catch (error) {
              reject(error);
            } finally {
              release();
            }
          };
          reader.readAsDataURL(chunk);
        } catch (error) {
          release();
          reject(error);
        }
      }),
    size: source.size,
  };
}

async function openNativeRange(
  file: UploadFile,
  fs: FileSystem
): Promise<Pick<FileReaderAdapter, "read" | "close">> {
  const { open, read, close } = fs;
  if (!(open && read && close)) {
    throw new UploadError(
      "This runtime needs filesystem open/read/close support, or an openFile adapter"
    );
  }
  const { fd } = await nativeCall<{ fd: string }>((callbacks) =>
    open.call(fs, { ...callbacks, filePath: file.path, flag: "r" })
  );
  return {
    close: async () => {
      await nativeCall((callbacks) => close.call(fs, { ...callbacks, fd }));
    },
    read: async (start, end) => {
      const arrayBuffer = new ArrayBuffer(end - start);
      if (start === end) {
        return arrayBuffer;
      }
      for (let position = start; position < end; position += 1024 * 1024) {
      const length = Math.min(1024 * 1024, end - position);
      const result = await nativeCall<{
        bytesRead: number;
        arrayBuffer: ArrayBuffer;
      }>((callbacks) =>
        read.call(fs, {
          ...callbacks,
          arrayBuffer: new ArrayBuffer(length),
          fd,
          length,
          offset: 0,
          position,
        })
      );
      if (result.bytesRead !== length) {
        throw new UploadError(
          "File changed or native filesystem returned a short read"
        );
      }
      new Uint8Array(arrayBuffer).set(new Uint8Array(result.arrayBuffer), position - start);
      }
      return arrayBuffer;
    },
  };
}

async function openRawFile(
  file: UploadFile,
  config: FileConfig
): Promise<FileReaderAdapter> {
  if (config.openFile) {
    return config.openFile(file);
  }
  if (config.platform === "h5") {
    return openH5(file, config);
  }
  const api = getUni(config.uni);
  const fs =
    config.platform === "mp" ? api.getFileSystemManager?.() : undefined;
  const getInfo = fs?.getFileInfo?.bind(fs) ?? api.getFileInfo?.bind(api);
  if (config.platform === "app") {
    const source = await openPlus(file, api);
    const reader: FileReaderAdapter = {
      ...source,
      checksum: async (progress) => {
        const info = getInfo
          ? await nativeCall<{ size: number; digest?: string }>((callbacks) =>
              getInfo?.({
                ...callbacks,
                digestAlgorithm: "md5",
                filePath: file.path,
              })
            )
          : undefined;
        return info?.digest || hash(reader, progress);
      },
      name: fileName(file),
    };
    return reader;
  }
  if (!(getInfo || fs?.stat)) {
    throw new UploadError(
      "Native file info is unavailable; supply an openFile adapter"
    );
  }
  const info = fs?.stat
    ? {
        size: (
          await nativeCall<{ stats: { size: number } }>((callbacks) =>
            fs.stat?.({ ...callbacks, path: file.path })
          )
        ).stats.size,
      }
    : await nativeCall<{ size: number; digest?: string }>((callbacks) =>
        getInfo?.({ ...callbacks, digestAlgorithm: "md5", filePath: file.path })
      );
  // Open lazily: deduplicated uploads need only native file info, no file descriptor.
  let range: Promise<Pick<FileReaderAdapter, "read" | "close">> | undefined;
  const reader: FileReaderAdapter = {
    checksum: async (progress) => {
      const digest =
        info.digest ??
        (getInfo
          ? (
              await nativeCall<{ digest?: string; size: number }>((callbacks) =>
                getInfo?.({
                  ...callbacks,
                  digestAlgorithm: "md5",
                  filePath: file.path,
                })
              )
            ).digest
          : undefined);
      return digest || hash(reader, progress);
    },
    close: async () => {
      if (range) {
        const opened = await range.catch(() => undefined);
        await opened?.close();
      }
    },
    name: fileName(file),
    read: async (start, end) => {
      range ??= openNativeRange(file, fs ?? {});
      return (await range).read(start, end);
    },
    size: info.size,
  };
  return reader;
}

/** Guards every adapter, including custom readers, with the same lifecycle. */
export async function openUploadFile(
  file: UploadFile,
  config: FileConfig
): Promise<FileReaderAdapter> {
  const raw = await openRawFile(file, config);
  if (!Number.isSafeInteger(raw.size) || raw.size < 0) {
    await cleanup(raw.close, config);
    throw new UploadError("Invalid file size");
  }
  let closing: Promise<void> | undefined;
  const active = new Set<Promise<unknown>>();
  let digest: Promise<string> | undefined;
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    if (closing) {
      return Promise.reject(new UploadError("File has been closed"));
    }
    const pending = Promise.resolve().then(operation);
    active.add(pending);
    pending.then(
      () => active.delete(pending),
      () => active.delete(pending)
    );
    return pending;
  };
  return {
    checksum: (progress) =>
      run(async () => {
        digest ??= Promise.resolve().then(() => raw.checksum(progress));
        try {
          const value = await digest;
          progress?.(100);
          return value;
        } catch (error) {
          digest = undefined;
          throw error;
        }
      }),
    close: () => {
      closing ??= Promise.allSettled([...active]).then(() => raw.close());
      return closing;
    },
    name: raw.name,
    read: (start, end) =>
      run(async () => {
        if (
          !(Number.isSafeInteger(start) && Number.isSafeInteger(end)) ||
          start < 0 ||
          end < start ||
          end > raw.size
        ) {
          throw new UploadError("Invalid file byte range");
        }
        const data = await raw.read(start, end);
        if (!(data instanceof ArrayBuffer) || data.byteLength !== end - start) {
          throw new UploadError("File reader returned an invalid byte range");
        }
        return data;
      }),
    size: raw.size,
  };
}

export async function cleanup(
  operation: () => Promise<void>,
  config: Pick<FileConfig, "onCleanupError">
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    try {
      config.onCleanupError?.(error);
    } catch {
      /* Diagnostic hooks cannot replace the result. */
    }
  }
}

export interface TemporaryFile {
  dispose: () => Promise<void>;
  file: UploadFile;
}

let temporarySequence = 0;
declare const wx: { env?: { USER_DATA_PATH?: string } };

/** Creates only owned files; never removes a picker/source path. */
export async function createTemporaryFile(
  data: ArrayBuffer,
  config: FileConfig
): Promise<TemporaryFile> {
  if (config.createTempFile) {
    const temporary = await config.createTempFile(data);
    return ownedTemporaryFile(temporary.file, temporary.dispose);
  }
  let dispose: () => Promise<void>;
  let file: UploadFile;
  if (config.platform === "h5") {
    const sourceFile = new Blob([data], { type: "application/octet-stream" });
    const path = URL.createObjectURL(sourceFile);
    file = { path, sourceFile };
    dispose = async () => URL.revokeObjectURL(path);
  } else {
    const api = getUni(config.uni);
    const fs = api.getFileSystemManager?.();
    const root =
      config.tempDirectory ??
      api.env?.USER_DATA_PATH ??
      (typeof wx === "undefined" ? undefined : wx.env?.USER_DATA_PATH);
    if (!(root && fs?.writeFile && fs.unlink)) {
      throw new UploadError(
        "Binary temporary files require filesystem writeFile/unlink and tempDirectory, or a createTempFile adapter"
      );
    }
    const path = `${root.replace(/\/$/, "")}/lp-upload-${Date.now()}-${++temporarySequence}-${Math.random().toString(36).slice(2)}.bin`;
    dispose = async () => {
      await nativeCall((callbacks) =>
        fs.unlink?.({ ...callbacks, filePath: path })
      );
    };
    try {
      await nativeCall((callbacks) =>
        fs.writeFile?.({ ...callbacks, data, filePath: path })
      );
    } catch (error) {
      await cleanup(dispose, config);
      throw error;
    }
    file = { path };
  }
  return ownedTemporaryFile(file, dispose);
}

function ownedTemporaryFile(
  file: UploadFile,
  dispose: () => Promise<void>
): TemporaryFile {
  let disposed: Promise<void> | undefined;
  return {
    dispose: () => {
      disposed ??= Promise.resolve().then(dispose);
      return disposed;
    },
    file,
  };
}

/** Size/name only; does not request MD5 on runtimes with stat/HTML5+ support. */
export async function getFileMetadata(
  input: UploadFile | string,
  config: FileConfig
): Promise<Omit<UploadFileInfo, "md5">> {
  const file = typeof input === "string" ? { path: input } : input;
  const reader = await openUploadFile(file, config);
  try {
    return { name: reader.name, path: file.path, size: reader.size };
  } finally {
    await cleanup(reader.close, config);
  }
}

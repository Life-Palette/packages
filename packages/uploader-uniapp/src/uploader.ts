import {
  cleanup,
  type FileConfig,
  type FileReaderAdapter,
  openUploadFile,
} from "./file";
import { createTransport, type TransportConfig } from "./transport";
import {
  UploadCancellation,
  UploadError,
  type UploadedFile,
  type UploadFile,
  type UploadOptions,
  type UploadPart,
  type UploadProgress,
  type UploadSession,
} from "./types";

export interface UploaderConfig extends FileConfig, TransportConfig {
  partConcurrency?: number;
  partRetries?: number;
  retryDelayMs?: number;
}

function uploadSettings(config: UploaderConfig, options: UploadOptions) {
  const concurrency = options.partConcurrency ?? config.partConcurrency ?? 2;
  const retries = options.partRetries ?? config.partRetries ?? 3;
  const retryDelayMs = config.retryDelayMs ?? 500;
  integer(concurrency, "partConcurrency");
  integer(retries, "partRetries", 0);
  integer(retryDelayMs, "retryDelayMs", 0);
  return { concurrency, retries, retryDelayMs };
}

/** Unified Go upload contract, without media analysis or picker side effects. */
export function createUploader(config: UploaderConfig) {
  const transport = createTransport(config);

  async function transfer(
    session: UploadSession,
    reader: FileReaderAdapter,
    options: UploadOptions,
    settings: { concurrency: number; retries: number; retryDelayMs: number }
  ): Promise<UploadPart[]> {
    const progress = options.onProgress;
    const { concurrency, retries, retryDelayMs } = settings;

    if (session.mode === "direct") {
      if (!session.upload?.url || session.upload.method !== "PUT") {
        throw new UploadError("Direct session requires a presigned PUT URL");
      }
      progress?.({ percent: 0, stage: "uploading" });
      const target = session.upload;
      const data = await readRange(reader, 0, reader.size);
      await retry(
        () =>
          transport.put(target.url, data, target.headers, options.cancellation),
        retries,
        retryDelayMs,
        options.cancellation
      );
      progress?.({ percent: 100, stage: "uploading" });
    } else if (session.mode === "multipart") {
      return uploadMultipart(
        session,
        reader,
        (url, data, headers) =>
          transport.put(url, data, headers, options.cancellation),
        {
          cancellation: options.cancellation,
          concurrency,
          onProgress: progress,
          retries,
          retryDelayMs,
        }
      );
    } else {
      throw new UploadError("Unsupported upload mode");
    }
    return [];
  }

  async function upload(
    input: UploadFile | string,
    options: UploadOptions = {}
  ): Promise<UploadedFile> {
    options.cancellation?.throwIfAborted();
    const settings = uploadSettings(config, options);
    const file = typeof input === "string" ? { path: input } : input;
    if (!file.path) {
      throw new UploadError("A local file path is required");
    }
    const progress = options.onProgress;
    progress?.({ percent: 0, stage: "md5" });
    const reader = await openUploadFile(file, config);
    let sessionId: string | undefined;
    try {
      options.cancellation?.throwIfAborted();
      validateReader(reader);
      const checksum = await getChecksum(reader, options);
      if (!checksum) {
        throw new UploadError("File checksum is empty");
      }
      options.cancellation?.throwIfAborted();
      progress?.({ percent: 100, stage: "md5" });
      progress?.({ percent: 0, stage: "initializing" });
      const session = await transport.request<UploadSession>(
        "/uploads",
        "POST",
        { checksum, file_name: reader.name, size: reader.size },
        options.cancellation
      );
      if (session.existing_file) {
        progress?.({ percent: 100, stage: "completing" });
        return session.existing_file;
      }
      if (!session.id || session.size !== reader.size) {
        throw new UploadError("Invalid upload session");
      }
      sessionId = session.id;
      progress?.({ percent: 100, stage: "initializing" });
      const parts = await transfer(session, reader, options, settings);
      progress?.({ percent: 0, stage: "completing" });
      const result = await transport.request<UploadedFile>(
        `/uploads/${encodeURIComponent(session.id)}/complete`,
        "POST",
        { is_private: options.isPrivate ?? false, parts },
        options.cancellation
      );
      progress?.({ percent: 100, stage: "completing" });
      return result;
    } catch (error) {
      if (options.cancellation?.aborted && sessionId) {
        await cleanup(async () => {
          await transport.request(
            `/uploads/${encodeURIComponent(sessionId ?? "")}`,
            "DELETE"
          );
        }, config);
      }
      throw error;
    } finally {
      await cleanup(reader.close, config);
    }
  }

  async function uploadFiles(
    files: Array<UploadFile | string>,
    options: UploadOptions = {}
  ): Promise<UploadedFile[]> {
    const results: UploadedFile[] = [];
    for (const file of files) {
      results.push(await upload(file, options));
    }
    return results;
  }

  const abort = (uploadId: string) =>
    transport.request(`/uploads/${encodeURIComponent(uploadId)}`, "DELETE");
  const start = (input: UploadFile | string, options: UploadOptions = {}) => {
    const cancellation = options.cancellation ?? new UploadCancellation();
    return {
      cancel: () => cancellation.cancel(),
      result: upload(input, { ...options, cancellation }),
    };
  };
  return { abort, start, upload, uploadFiles };
}

function validateReader(reader: FileReaderAdapter): void {
  integer(reader.size, "file size", 0);
  if (!reader.name) {
    throw new UploadError("A file name is required");
  }
}

export function integer(value: number, name: string, minimum = 1): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new UploadError(`${name} must be an integer >= ${minimum}`);
  }
}

function validate(session: UploadSession, size: number): void {
  integer(session.part_size ?? 0, "part_size");
  integer(session.total_parts, "total_parts");
  const total = Math.ceil(size / (session.part_size ?? 1));
  if (total !== session.total_parts) {
    throw new UploadError("Multipart session does not match file size");
  }
  const numbers = new Set<number>();
  const validateNumber = (number: number) => {
    integer(number, "part_number");
    if (number > total) {
      throw new UploadError("Part number exceeds total_parts");
    }
  };
  for (const part of session.uploaded_parts ?? []) {
    validateNumber(part.part_number);
    if (!part.etag || numbers.has(part.part_number)) {
      throw new UploadError("Invalid resumed parts");
    }
    numbers.add(part.part_number);
  }
  const signed = new Set<number>();
  for (const part of session.parts ?? []) {
    validateNumber(part.part_number);
    if (!part.url || signed.has(part.part_number)) {
      throw new UploadError("Invalid signed parts");
    }
    signed.add(part.part_number);
    numbers.add(part.part_number);
  }
  if (numbers.size !== total) {
    throw new UploadError("Multipart session is missing parts");
  }
}

export async function readRange(
  reader: FileReaderAdapter,
  start: number,
  end: number
): Promise<ArrayBuffer> {
  const data = await reader.read(start, end);
  if (!(data instanceof ArrayBuffer) || data.byteLength !== end - start) {
    throw new UploadError("File reader returned an invalid byte range");
  }
  return data;
}

export async function uploadMultipart(
  session: UploadSession,
  reader: FileReaderAdapter,
  put: (
    url: string,
    data: ArrayBuffer,
    headers?: Record<string, string>
  ) => Promise<string>,
  options: {
    cancellation?: UploadCancellation;
    concurrency: number;
    retries: number;
    retryDelayMs: number;
    onProgress?: (progress: UploadProgress) => void;
  }
): Promise<UploadPart[]> {
  validate(session, reader.size);
  const partSize = session.part_size ?? 0;
  const parts = [...(session.uploaded_parts ?? [])];
  const completed = new Set(parts.map((part) => part.part_number));
  const pending = (session.parts ?? []).filter(
    (part) => !completed.has(part.part_number)
  );
  const bytes = (number: number) =>
    Math.min(partSize, reader.size - (number - 1) * partSize);
  let loaded = parts.reduce((sum, part) => sum + bytes(part.part_number), 0);
  const report = (partNumber?: number) =>
    options.onProgress?.({
      partNumber,
      percent: Math.round((loaded / reader.size) * 100),
      stage: "uploading",
      totalParts: session.total_parts,
    });
  report();
  let cursor = 0;
  let failed = false;
  let firstError: unknown;

  async function putPart(
    part: NonNullable<UploadSession["parts"]>[number],
    data: ArrayBuffer
  ) {
    return retry(
      async () => {
        if (failed) {
          return;
        }
        const etag = await put(part.url, data, part.headers);
        if (!etag) {
          throw new UploadError(
            `Part ${part.part_number} did not return ETag; H5 storage CORS must expose ETag`
          );
        }
        return etag;
      },
      options.retries,
      options.retryDelayMs,
      options.cancellation
    );
  }

  async function worker() {
    while (!failed && cursor < pending.length) {
      const part = pending[cursor++];
      if (!part) {
        return;
      }
      try {
        options.cancellation?.throwIfAborted();
        const start = (part.part_number - 1) * partSize;
        const data = await readRange(
          reader,
          start,
          Math.min(start + partSize, reader.size)
        );
        const etag = await putPart(part, data);
        if (etag === undefined) {
          return;
        }
        parts.push({ etag, part_number: part.part_number });
        loaded += data.byteLength;
        report(part.part_number);
      } catch (error) {
        if (!failed) {
          firstError = error;
        }
        failed = true;
      }
    }
  }
  // Drain in-flight workers before closing the reader or rejecting the upload.
  await Promise.all(
    Array.from(
      { length: Math.min(options.concurrency, pending.length) },
      worker
    )
  );
  if (failed) {
    throw firstError;
  }
  return parts.sort((a, b) => a.part_number - b.part_number);
}

/** Retry only transport failures, throttling and transient server errors. */
export async function retry<T>(
  operation: () => Promise<T>,
  retries: number,
  delayMs: number,
  cancellation?: UploadCancellation
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    cancellation?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      cancellation?.throwIfAborted();
      if (
        !(error instanceof UploadError && error.retryable) ||
        attempt >= retries
      ) {
        throw error;
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => {
            unsubscribe();
            resolve();
          },
          Math.min(delayMs * 2 ** attempt, 30_000)
        );
        const unsubscribe =
          cancellation?.subscribe(() => {
            clearTimeout(timer);
            try {
              cancellation.throwIfAborted();
            } catch (reason) {
              reject(reason);
            }
          }) ?? (() => undefined);
      });
    }
  }
}

async function getChecksum(
  reader: FileReaderAdapter,
  options: UploadOptions
): Promise<string> {
  return (
    options.checksum ||
    reader.checksum((percent) => {
      options.cancellation?.throwIfAborted();
      options.onProgress?.({ percent, stage: "md5" });
    })
  );
}

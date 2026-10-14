import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTemporaryFile,
  type FileReaderAdapter,
  getFileMetadata,
  openUploadFile,
  splitFile,
} from "../src/file";
import { nativeCall, uploadFormChunk, uploadFormFile } from "../src/transport";
import { type UniRuntime, UploadCancellation, UploadError } from "../src/types";
import { retry } from "../src/uploader";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}

function adapter(): FileReaderAdapter {
  return {
    checksum: vi.fn(async () => "md5"),
    close: vi.fn(async () => undefined),
    name: "file.bin",
    read: vi.fn(async (start, end) => new ArrayBuffer(end - start)),
    size: 3,
  };
}

describe("file resource lifecycle", () => {
  it("shares concurrent checksum work and caches the result", async () => {
    const raw = adapter();
    const reader = await openUploadFile(
      { path: "file" },
      { openFile: async () => raw, platform: "mp" }
    );
    expect(await Promise.all([reader.checksum(), reader.checksum()])).toEqual([
      "md5",
      "md5",
    ]);
    expect(await reader.checksum()).toBe("md5");
    expect(raw.checksum).toHaveBeenCalledOnce();
    await reader.close();
  });

  it("drains reads and shares one close promise, refusing new reads", async () => {
    const raw = adapter();
    const read = deferred<ArrayBuffer>();
    raw.read = () => read.promise;
    const reader = await openUploadFile(
      { path: "file" },
      { openFile: async () => raw, platform: "mp" }
    );
    const pending = reader.read(0, 3);
    const closing = reader.close();
    expect(reader.close()).toBe(closing);
    expect(raw.close).not.toHaveBeenCalled();
    await expect(reader.read(0, 1)).rejects.toThrow("closed");
    await expect(reader.checksum()).rejects.toThrow("closed");
    read.resolve(new ArrayBuffer(3));
    await pending;
    await closing;
    expect(raw.close).toHaveBeenCalledOnce();
  });

  it("releases failed reads and allows failed digest computation to be retried", async () => {
    const raw = adapter();
    raw.checksum = vi
      .fn()
      .mockRejectedValueOnce(new Error("digest failed"))
      .mockResolvedValue("md5");
    const reader = await openUploadFile(
      { path: "file" },
      { openFile: async () => raw, platform: "mp" }
    );
    await expect(reader.checksum()).rejects.toThrow("digest failed");
    expect(await reader.checksum()).toBe("md5");
    await expect(reader.read(0, 4)).rejects.toThrow("range");
    await reader.close();
    expect(raw.close).toHaveBeenCalledOnce();
  });

  it("obtains native size without MD5 until explicitly requested", async () => {
    const digest = vi.fn((options) =>
      options.success({ digest: "native", size: 3 })
    );
    const uni: UniRuntime = {
      getFileSystemManager: () => ({
        getFileInfo: digest,
        stat: (options) => options.success({ stats: { size: 3 } }),
      }),
      request: vi.fn(),
    };
    expect(await getFileMetadata("/file", { platform: "mp", uni })).toEqual({
      name: "file",
      path: "/file",
      size: 3,
    });
    expect(digest).not.toHaveBeenCalled();
    const reader = await openUploadFile(
      { path: "/file" },
      { platform: "mp", uni }
    );
    expect(digest).not.toHaveBeenCalled();
    expect(await reader.checksum()).toBe("native");
    expect(await reader.checksum()).toBe("native");
    expect(digest).toHaveBeenCalledOnce();
    await reader.close();
  });
});

describe("owned temporary chunks", () => {
  it("writes only the requested bytes and removes only generated paths once", async () => {
    const unlink = vi.fn((options) => options.success({}));
    const writeFile = vi.fn((options) => options.success({}));
    const uni: UniRuntime = {
      env: { USER_DATA_PATH: "/sandbox" },
      getFileSystemManager: () => ({ unlink, writeFile }),
      request: vi.fn(),
    };
    const split = await splitFile("/original", {
      chunkSize: 2,
      openFile: async () => adapter(),
      platform: "mp",
      uni,
    });
    const temporary = await split.chunks[1]?.toFile();
    expect(writeFile.mock.calls[0]?.[0].data.byteLength).toBe(1);
    expect(temporary?.file.path).toMatch(/^\/sandbox\/lp-upload-.*\.bin$/);
    await temporary?.dispose();
    await split.close();
    expect(unlink).toHaveBeenCalledOnce();
    expect(unlink.mock.calls[0]?.[0].filePath).not.toBe("/original");
  });

  it("cleans partially created files when the native write fails", async () => {
    const unlink = vi.fn((options) => options.success({}));
    const uni: UniRuntime = {
      getFileSystemManager: () => ({
        unlink,
        writeFile: (options) => options.fail({ errMsg: "disk full" }),
      }),
      request: vi.fn(),
    };
    await expect(
      createTemporaryFile(new ArrayBuffer(2), {
        platform: "mp",
        tempDirectory: "/sandbox",
        uni,
      })
    ).rejects.toThrow("disk full");
    expect(unlink).toHaveBeenCalledOnce();
  });

  it("waits for materialization before close disposes its generated file", async () => {
    const raw = adapter();
    const data = deferred<ArrayBuffer>();
    raw.read = () => data.promise;
    const dispose = vi.fn(async () => undefined);
    const split = await splitFile("/original", {
      chunkSize: 3,
      createTempFile: async () => ({ dispose, file: { path: "/owned" } }),
      openFile: async () => raw,
      platform: "mp",
    });
    const pending = split.chunks[0]?.toFile();
    const closing = split.close();
    expect(split.close()).toBe(closing);
    data.resolve(new ArrayBuffer(3));
    await pending;
    await closing;
    expect(dispose).toHaveBeenCalledOnce();
    expect(raw.close).toHaveBeenCalledOnce();
  });

  it("revokes only its own H5 object URL", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const temp = await createTemporaryFile(new ArrayBuffer(3), {
      platform: "h5",
    });
    expect(temp.file.sourceFile?.size).toBe(3);
    await temp.dispose();
    await temp.dispose();
    expect(revoke).toHaveBeenCalledExactlyOnceWith(temp.file.path);
    revoke.mockRestore();
  });

  it.each([200, 413])(
    "cleans a native form chunk after HTTP %s",
    async (statusCode) => {
      const dispose = vi.fn(async () => undefined);
      const split = await splitFile("/original", {
        chunkSize: 3,
        createTempFile: async () => ({ dispose, file: { path: "/owned" } }),
        openFile: async () => adapter(),
        platform: "mp",
      });
      const uni: UniRuntime = {
        request: vi.fn(),
        uploadFile: (options) => {
          options.success({ data: "response", statusCode });
          return { abort: vi.fn(), onProgressUpdate: vi.fn() };
        },
      };
      const chunk = split.chunks[0];
      if (!chunk) {
        throw new Error("missing chunk");
      }
      const task = uploadFormChunk(chunk, { uni, url: "url" });
      if (statusCode === 200) {
        await task.result;
      } else {
        await expect(task.result).rejects.toMatchObject({ status: 413 });
      }
      await split.close();
      expect(dispose).toHaveBeenCalledOnce();
    }
  );
});

describe("native cancellation and transient retries", () => {
  it("aborts native tasks and rejects even without a native fail callback", async () => {
    const cancellation = new UploadCancellation();
    const abort = vi.fn();
    const result = nativeCall(() => ({ abort }), cancellation);
    const assertion = expect(result).rejects.toMatchObject({
      name: "UploadCancelledError",
    });
    cancellation.cancel();
    cancellation.cancel();
    await assertion;
    expect(abort).toHaveBeenCalledOnce();
  });

  it("does not start a native request after cancellation", async () => {
    const cancellation = new UploadCancellation();
    cancellation.cancel();
    const run = vi.fn();
    await expect(nativeCall(run, cancellation)).rejects.toThrow("cancelled");
    expect(run).not.toHaveBeenCalled();
  });

  it("cancels form chunks and cleans up before rejecting", async () => {
    const dispose = vi.fn(async () => undefined);
    const abort = vi.fn();
    const started = deferred<void>();
    const split = await splitFile("/file", {
      chunkSize: 3,
      createTempFile: async () => ({ dispose, file: { path: "/owned" } }),
      openFile: async () => adapter(),
      platform: "mp",
    });
    const uni: UniRuntime = {
      request: vi.fn(),
      uploadFile: () => {
        started.resolve();
        return { abort, onProgressUpdate: vi.fn() };
      },
    };
    const chunk = split.chunks[0];
    if (!chunk) {
      throw new Error("missing chunk");
    }
    const task = uploadFormChunk(chunk, { uni, url: "url" });
    const assertion = expect(task.result).rejects.toThrow("cancelled");
    await started.promise;
    task.abort();
    await assertion;
    expect(abort).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    await split.close();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("ignores cancellation after a successful form upload", async () => {
    const abort = vi.fn();
    const uni: UniRuntime = {
      request: vi.fn(),
      uploadFile: (options) => {
        options.success({ data: "", statusCode: 200 });
        return { abort, onProgressUpdate: vi.fn() };
      },
    };
    const task = uploadFormFile("/file", { uni, url: "url" });
    await task.result;
    task.abort();
    expect(abort).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 413])("never retries HTTP %s", async (status) => {
    const operation = vi.fn(async () => {
      throw new UploadError("permanent", { status });
    });
    await expect(retry(operation, 3, 0)).rejects.toMatchObject({ status });
    expect(operation).toHaveBeenCalledOnce();
  });

  it.each([429, 500, 503])(
    "retries HTTP %s within the attempt budget",
    async (status) => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new UploadError("transient", { status }))
        .mockResolvedValue("ok");
      expect(await retry(operation, 2, 0)).toBe("ok");
      expect(operation).toHaveBeenCalledTimes(2);
    }
  );

  it("cancels retry backoff without leaving a timer", async () => {
    vi.useFakeTimers();
    const cancellation = new UploadCancellation();
    const operation = vi.fn(async () => {
      throw new UploadError("network", { retryable: true });
    });
    const result = retry(operation, 3, 1000, cancellation);
    const assertion = expect(result).rejects.toThrow("cancelled");
    await Promise.resolve();
    cancellation.cancel();
    await assertion;
    expect(operation).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

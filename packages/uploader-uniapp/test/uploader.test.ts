import { describe, expect, it, vi } from "vitest";
import type { FileReaderAdapter } from "../src/file";
import { createTransport } from "../src/transport";
import {
  type UniRuntime,
  UploadCancellation,
  type UploadProgress,
  type UploadSession,
} from "../src/types";
import { createUploader } from "../src/uploader";

const direct: UploadSession = {
  id: "upload/1",
  mode: "direct",
  size: 7,
  total_parts: 1,
  upload: {
    expires_at: 1,
    headers: { "x-signature": "signed" },
    method: "PUT",
    url: "https://storage/direct",
  },
};
const multipart: UploadSession = {
  id: "upload/1",
  mode: "multipart",
  part_size: 3,
  parts: [1, 2, 3].map((part_number) => ({
    expires_at: 1,
    part_number,
    url: `https://storage/${part_number}`,
  })),
  size: 7,
  total_parts: 3,
};
type Request = Parameters<UniRuntime["request"]>[0];

function fixture(
  session: UploadSession = direct,
  storage?: (options: Request) => void
) {
  const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6]).buffer;
  const reader: FileReaderAdapter = {
    checksum: vi.fn(async () => "native-md5"),
    close: vi.fn(async () => undefined),
    name: "original.png",
    read: vi.fn(async (start, end) => data.slice(start, end)),
    size: 7,
  };
  const request = vi.fn((options: Request) => {
    if (options.method === "PUT") {
      if (storage) {
        storage(options);
      } else {
        options.success({
          data: "",
          header: { eTaG: '"storage-etag"' },
          statusCode: 200,
        });
      }
    } else {
      options.success({
        data: {
          data: options.url.endsWith("/uploads") ? session : { uid: "file-1" },
        },
        header: {},
        statusCode: 200,
      });
    }
  });
  const uni: UniRuntime = { request };
  const uploader = createUploader({
    apiBaseUrl: "https://api/v1/",
    getToken: () => "secret",
    openFile: async () => reader,
    platform: "mp",
    retryDelayMs: 0,
    uni,
  });
  return { reader, request, uni, uploader };
}

describe("uni-app unified uploader", () => {
  it.each([direct, multipart])("passes metadata through and reuses its MD5 in $mode uploads", async (session) => {
    const { uploader, request, reader } = fixture(session);
    const metadata = { schema_version: 1 as const, basic: { name: "original.png", size: 7, md5: "analyzed-md5", extension: ".png", type: "image/png", width: 4, height: 3 }, image: { colors: [], exif: { device_make: "TestCam" } } };
    await uploader.upload("/file", { metadata });
    expect(reader.checksum).not.toHaveBeenCalled();
    expect(request.mock.calls[0]?.[0].data).toMatchObject({ checksum: "analyzed-md5" });
    const complete = request.mock.calls.find(([options]) => options.url.endsWith("/complete"));
    expect(complete?.[0].data).toMatchObject({ metadata });
  });
  it("rejects stale metadata and conflicting checksums before network requests", async () => {
    const { uploader, request, reader } = fixture();
    const metadata = { schema_version: 1 as const, basic: { name: "file", size: 8, md5: "abc", type: "image/png", extension: ".png" } };
    await expect(uploader.upload("/file", { metadata })).rejects.toThrow("Metadata size");
    expect(request).not.toHaveBeenCalled();
    metadata.basic.size = 7;
    await expect(uploader.upload("/file", { metadata, checksum: "different" })).rejects.toThrow("MD5");
    expect(reader.close).toHaveBeenCalledTimes(2);
  });
  it("does not reuse one metadata object across multiple files", async () => {
    const { uploader, request } = fixture();
    await expect(uploader.uploadFiles(["/a", "/b"], { metadata: { schema_version: 1, basic: { name: "file", size: 7, md5: "abc", type: "image/png", extension: ".png" } } })).rejects.toThrow("each file");
    expect(request).not.toHaveBeenCalled();
  });
  it("retries direct PUT failures without rereading the file", async () => {
    let attempts = 0;
    const { reader, uploader } = fixture(direct, (options) => {
      attempts++;
      options.success({
        data: "",
        header: {},
        statusCode: attempts === 1 ? 503 : 200,
      });
    });
    await uploader.upload("/file");
    expect(attempts).toBe(2);
    expect(reader.read).toHaveBeenCalledOnce();
  });

  it("reports cleanup failures without changing a successful upload", async () => {
    const { reader, uni } = fixture();
    const cleanupError = new Error("close failed");
    reader.close = async () => {
      throw cleanupError;
    };
    const onCleanupError = vi.fn();
    const uploader = createUploader({
      apiBaseUrl: "https://api/v1",
      getToken: () => null,
      onCleanupError,
      openFile: async () => reader,
      platform: "mp",
      uni,
    });
    await expect(uploader.upload("/file")).resolves.toEqual({ uid: "file-1" });
    expect(onCleanupError).toHaveBeenCalledExactlyOnceWith(cleanupError);
  });

  it("cancels all active multipart requests, stops the queue and cleans the session", async () => {
    const { reader, uni, request } = fixture(multipart);
    const abort = vi.fn();
    let ready: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let active = 0;
    request.mockImplementation((options) => {
      if (options.method === "PUT") {
        active++;
        if (active === 2) {
          ready();
        }
        return { abort };
      }
      options.success({
        data: { data: multipart },
        header: {},
        statusCode: 200,
      });
      return { abort: vi.fn() };
    });
    const uploader = createUploader({
      apiBaseUrl: "https://api/v1",
      getToken: () => null,
      openFile: async () => reader,
      platform: "mp",
      uni,
    });
    const task = uploader.start("/file");
    const assertion = expect(task.result).rejects.toMatchObject({
      name: "UploadCancelledError",
    });
    await started;
    task.cancel();
    await assertion;
    expect(abort).toHaveBeenCalledTimes(2);
    expect(active).toBe(2);
    expect(
      request.mock.calls.some(([options]) => options.method === "DELETE")
    ).toBe(true);
    expect(
      request.mock.calls.some(([options]) => options.url.endsWith("/complete"))
    ).toBe(false);
    expect(reader.close).toHaveBeenCalledOnce();
  });

  it("does not initialize a server session when cancelled during checksum", async () => {
    const { reader, uploader, request } = fixture();
    const cancellation = new UploadCancellation();
    reader.checksum = async () => {
      cancellation.cancel();
      return "md5";
    };
    await expect(uploader.upload("/file", { cancellation })).rejects.toThrow(
      "cancelled"
    );
    expect(request).not.toHaveBeenCalled();
    expect(reader.close).toHaveBeenCalledOnce();
  });
  it("sends binary PUT and completes without metadata, retaining the original name", async () => {
    const { reader, request, uploader } = fixture();
    expect(
      await uploader.upload("/tmp/photo.png", { isPrivate: true })
    ).toEqual({ uid: "file-1" });
    const calls = request.mock.calls.map(([options]) => options);
    expect(calls[0]?.data).toEqual({
      checksum: "native-md5",
      file_name: "original.png",
      size: 7,
    });
    expect(calls[0]?.header.Authorization).toBe("Bearer secret");
    expect(calls[1]?.header).toEqual({
      "Content-Type": "application/octet-stream",
      "x-signature": "signed",
    });
    expect(calls[1]?.data).toBeInstanceOf(ArrayBuffer);
    expect(calls[2]?.url).toBe("https://api/v1/uploads/upload%2F1/complete");
    expect(calls[2]?.data).toEqual({ is_private: true, parts: [] });
    expect(reader.close).toHaveBeenCalledOnce();
  });

  it("returns deduplicated files without reading or completing", async () => {
    const { reader, request, uploader } = fixture({
      ...direct,
      existing_file: { uid: "existing" } as NonNullable<
        UploadSession["existing_file"]
      >,
    });
    expect(
      await uploader.upload("/tmp/file", { checksum: "provided" })
    ).toEqual({ uid: "existing" });
    expect(reader.checksum).not.toHaveBeenCalled();
    expect(reader.read).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledOnce();
    expect(reader.close).toHaveBeenCalledOnce();
  });

  it("resumes parts, reads exact ranges, sorts ETags and reports resumed bytes", async () => {
    const { reader, request, uploader } = fixture({
      ...multipart,
      uploaded_parts: [{ etag: "existing", part_number: 1 }],
    });
    const progress: UploadProgress[] = [];
    await uploader.upload("/tmp/file", {
      onProgress: (value) => progress.push(value),
    });
    expect(reader.read).toHaveBeenCalledWith(3, 6);
    expect(reader.read).toHaveBeenCalledWith(6, 7);
    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(
      progress
        .filter((value) => value.stage === "uploading")
        .map((value) => value.percent)
    ).toEqual([43, 86, 100]);
    expect(request.mock.calls.at(-1)?.[0].data).toEqual({
      is_private: false,
      parts: [
        { etag: "existing", part_number: 1 },
        { etag: "storage-etag", part_number: 2 },
        { etag: "storage-etag", part_number: 3 },
      ],
    });
  });

  it("completes fully resumed sessions without opening ranges", async () => {
    const { reader, uploader } = fixture({
      ...multipart,
      parts: [],
      uploaded_parts: [1, 2, 3].map((part_number) => ({
        etag: "existing",
        part_number,
      })),
    });
    await uploader.upload("/tmp/file");
    expect(reader.read).not.toHaveBeenCalled();
  });

  it("retries each failed part with the same bytes", async () => {
    let attempts = 0;
    const { reader, request, uploader } = fixture(multipart, (options) => {
      attempts++;
      if (attempts === 1) {
        options.fail({ errMsg: "network failure" });
      } else {
        options.success({ data: "", header: { etag: "ok" }, statusCode: 200 });
      }
    });
    await uploader.upload("/tmp/file", { partConcurrency: 1, partRetries: 1 });
    expect(
      request.mock.calls.filter(([options]) => options.method === "PUT")
    ).toHaveLength(4);
    expect(reader.read).toHaveBeenCalledTimes(3);
  });

  it("requires ETag, stops queued work, drains in-flight requests and closes once", async () => {
    let finishSecond: (() => void) | undefined;
    const { reader, request, uploader } = fixture(multipart, (options) => {
      if (options.url.endsWith("/1")) {
        queueMicrotask(() =>
          options.success({ data: "", header: {}, statusCode: 200 })
        );
      } else {
        finishSecond = () =>
          options.success({
            data: "",
            header: { etag: "second" },
            statusCode: 200,
          });
      }
    });
    const result = uploader.upload("/tmp/file", {
      partConcurrency: 2,
      partRetries: 0,
    });
    const assertion = expect(result).rejects.toThrow("ETag");
    await vi.waitFor(() => expect(finishSecond).toBeTypeOf("function"));
    expect(reader.close).not.toHaveBeenCalled();
    finishSecond?.();
    await assertion;
    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(reader.close).toHaveBeenCalledOnce();
    expect(
      request.mock.calls.some(([options]) => options.url.endsWith("/complete"))
    ).toBe(false);
  });

  it.each([
    { ...multipart, parts: multipart.parts?.slice(0, 2) },
    { ...multipart, part_size: 0 },
    { ...multipart, parts: [{ expires_at: 1, part_number: 4, url: "url" }] },
    { ...multipart, uploaded_parts: [{ etag: "", part_number: 1 }] },
  ])("rejects malformed sessions before storage writes", async (session) => {
    const { reader, request, uploader } = fixture(session);
    await expect(uploader.upload("/tmp/file")).rejects.toThrow();
    expect(reader.read).not.toHaveBeenCalled();
    expect(
      request.mock.calls.some(([options]) => options.method === "PUT")
    ).toBe(false);
    expect(reader.close).toHaveBeenCalledOnce();
  });

  it("rejects invalid concurrency without starting requests", async () => {
    const { request, uploader } = fixture();
    await expect(
      uploader.upload("/tmp/file", { partConcurrency: 0 })
    ).rejects.toThrow("partConcurrency");
    expect(request).not.toHaveBeenCalled();
  });

  it("propagates API errors with details and releases the reader", async () => {
    const { uni, reader } = fixture();
    uni.request = (options) =>
      options.success({
        data: JSON.stringify({ details: "reason", message: "Forbidden" }),
        header: {},
        statusCode: 403,
      });
    const uploader = createUploader({
      apiBaseUrl: "https://api",
      getToken: () => null,
      openFile: async () => reader,
      platform: "mp",
      uni,
    });
    await expect(uploader.upload("/tmp/file")).rejects.toMatchObject({
      details: "reason",
      message: "Forbidden",
      status: 403,
    });
    expect(reader.close).toHaveBeenCalledOnce();
  });

  it("rejects truncated file reads", async () => {
    const { uploader, reader } = fixture();
    reader.read = async () => new ArrayBuffer(1);
    await expect(uploader.upload("/tmp/file")).rejects.toThrow("byte range");
    expect(reader.close).toHaveBeenCalledOnce();
  });

  it("aborts remote sessions using DELETE", async () => {
    const { uploader, request } = fixture();
    await uploader.abort("upload/1");
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      method: "DELETE",
      url: "https://api/v1/uploads/upload%2F1",
    });
  });

  it("recognizes storage HTTP failures", async () => {
    const { uni } = fixture(direct, (options) =>
      options.success({ data: "storage failure", header: {}, statusCode: 500 })
    );
    await expect(
      createTransport({
        apiBaseUrl: "https://api",
        getToken: () => null,
        uni,
      }).put("https://storage", new ArrayBuffer(0))
    ).rejects.toMatchObject({ status: 500 });
  });
});

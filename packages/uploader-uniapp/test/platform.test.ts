import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getChunkRanges,
  getFileInfo,
  openUploadFile,
  splitFile,
} from "../src/file";
import {
  checkPermission,
  chooseImages,
  ensurePermission,
  openPermissionSettings,
} from "../src/picker";
import { uploadFormFile } from "../src/transport";
import type { UniRuntime } from "../src/types";

afterEach(() => vi.unstubAllGlobals());

function runtime(): UniRuntime {
  return { request: vi.fn() };
}

describe("native file readers", () => {
  it.each(["constructor", "read", "decode"])(
    "releases App slices when %s fails synchronously",
    async (stage) => {
      const chunkClose = vi.fn();
      const sourceClose = vi.fn();
      class Reader {
        result = "invalid data URL";
        onload?: () => void;
        constructor() {
          if (stage === "constructor") {
            throw new Error("constructor failed");
          }
        }
        readAsDataURL() {
          if (stage === "read") {
            throw new Error("read failed");
          }
          this.onload?.();
        }
      }
      vi.stubGlobal("plus", {
        io: {
          FileReader: Reader,
          resolveLocalFileSystemURL: (
            _path: string,
            success: (entry: unknown) => void
          ) =>
            success({
              file: (resolve: (file: unknown) => void) =>
                resolve({
                  close: sourceClose,
                  size: 3,
                  slice: () => ({ close: chunkClose }),
                }),
            }),
        },
      });
      const uni = runtime();
      uni.base64ToArrayBuffer = () => new ArrayBuffer(3);
      const reader = await openUploadFile(
        { path: "_doc/file" },
        { platform: "app", uni }
      );
      await expect(reader.read(0, 3)).rejects.toThrow();
      await reader.close();
      expect(chunkClose).toHaveBeenCalledOnce();
      expect(sourceClose).toHaveBeenCalledOnce();
    }
  );
  it("provides standalone file info and lazy chunks without a server protocol", async () => {
    const file = {
      path: "blob:local",
      sourceFile: new File(["abcdefg"], "custom.bin"),
    };
    const uni = runtime();
    expect(await getFileInfo(file, { platform: "h5", uni })).toEqual({
      md5: "7ac66c0f148de9519b8bd264312c4d64",
      name: "custom.bin",
      path: "blob:local",
      size: 7,
    });
    const split = await splitFile(file, { chunkSize: 3, platform: "h5", uni });
    expect(split.totalParts).toBe(3);
    expect(
      split.chunks.map(({ partNumber, start, end, size }) => ({
        end,
        partNumber,
        size,
        start,
      }))
    ).toEqual(getChunkRanges(7, 3));
    expect([
      ...new Uint8Array((await split.chunks[1]?.read()) ?? new ArrayBuffer(0)),
    ]).toEqual([100, 101, 102]);
    expect(await split.checksum()).toBe("7ac66c0f148de9519b8bd264312c4d64");
    expect(uni.request).not.toHaveBeenCalled();
    await split.close();
    await split.close();
    await expect(split.chunks[0]?.read()).rejects.toThrow("closed");
  });

  it("handles empty files, final short chunks, and invalid chunk sizes", () => {
    expect(getChunkRanges(0, 3)).toEqual([]);
    expect(getChunkRanges(7, 3)).toEqual([
      { end: 3, partNumber: 1, size: 3, start: 0 },
      { end: 6, partNumber: 2, size: 3, start: 3 },
      { end: 7, partNumber: 3, size: 1, start: 6 },
    ]);
    expect(() => getChunkRanges(7, 0)).toThrow();
    expect(() => getChunkRanges(-1, 3)).toThrow();
  });
  it("uses native MD5 and range reads, then closes the file descriptor", async () => {
    const uni = runtime();
    const close = vi.fn((options) => options.success({}));
    const read = vi.fn((options) => {
      new Uint8Array(options.arrayBuffer).set([2, 3]);
      options.success({ arrayBuffer: options.arrayBuffer, bytesRead: 2 });
    });
    const nativeGetFileInfo = vi.fn((options) =>
      options.success({ digest: "native-md5", size: 4 })
    );
    uni.getFileSystemManager = () => ({
      close,
      getFileInfo: nativeGetFileInfo,
      open: (options) => options.success({ fd: "fd" }),
      read,
    });
    const reader = await openUploadFile(
      { path: "/tmp/file.jpg" },
      { platform: "mp", uni }
    );
    expect(await reader.checksum()).toBe("native-md5");
    expect(read).not.toHaveBeenCalled();
    expect(nativeGetFileInfo).toHaveBeenCalledWith(
      expect.objectContaining({ digestAlgorithm: "md5" })
    );
    expect([...new Uint8Array(await reader.read(2, 4))]).toEqual([2, 3]);
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ length: 2, offset: 0, position: 2 })
    );
    await reader.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("hashes H5 sourceFile without making a network request", async () => {
    const uni = runtime();
    vi.stubGlobal("fetch", () => {
      throw new Error("fetch must never be used");
    });
    const reader = await openUploadFile(
      { path: "blob:local", sourceFile: new Blob(["abc"]) },
      { platform: "h5", uni }
    );
    expect(await reader.checksum()).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(uni.request).not.toHaveBeenCalled();
    expect([...new Uint8Array(await reader.read(1, 3))]).toEqual([98, 99]);
  });

  it("reads a H5 file URL via uni.request with ArrayBuffer response", async () => {
    const uni = runtime();
    uni.request = vi.fn((options) =>
      options.success({
        data: new Uint8Array([97, 98, 99]).buffer,
        header: {},
        statusCode: 200,
      })
    );
    const reader = await openUploadFile(
      { path: "blob:local" },
      { platform: "h5", uni }
    );
    expect(await reader.checksum()).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: "GET", responseType: "arraybuffer" })
    );
  });

  it("falls back to incremental JS MD5 when native digest is missing", async () => {
    const uni = runtime();
    uni.getFileSystemManager = () => ({
      close: (options) => options.success({}),
      getFileInfo: (options) => options.success({ size: 3 }),
      open: (options) => options.success({ fd: "fd" }),
      read: (options) => {
        new Uint8Array(options.arrayBuffer).set([97, 98, 99]);
        options.success({ arrayBuffer: options.arrayBuffer, bytesRead: 3 });
      },
    });
    const reader = await openUploadFile(
      { path: "/tmp/file" },
      { platform: "mp", uni }
    );
    expect(await reader.checksum()).toBe("900150983cd24fb0d6963f7d28e17f72");
    await reader.close();
  });

  it("reads App file slices using HTML5+ and native base64 conversion", async () => {
    const uni = runtime();
    uni.getFileInfo = (options) =>
      options.success({ digest: "native-md5", size: 3 });
    uni.base64ToArrayBuffer = (value) =>
      Uint8Array.from(Buffer.from(value, "base64")).buffer;
    const chunkClose = vi.fn();
    const sourceClose = vi.fn();
    const slice = vi.fn(() => ({ close: chunkClose }));
    class Reader {
      result = "data:application/octet-stream;base64,YmM=";
      onload?: () => void;
      readAsDataURL() {
        this.onload?.();
      }
    }
    vi.stubGlobal("plus", {
      io: {
        FileReader: Reader,
        resolveLocalFileSystemURL: (
          _path: string,
          success: (entry: unknown) => void
        ) =>
          success({
            file: (resolve: (file: unknown) => void) =>
              resolve({ close: sourceClose, size: 3, slice }),
          }),
      },
    });
    const reader = await openUploadFile(
      { path: "_doc/file.jpg" },
      { platform: "app", uni }
    );
    expect(await reader.checksum()).toBe("native-md5");
    expect([...new Uint8Array(await reader.read(1, 3))]).toEqual([98, 99]);
    expect(slice).toHaveBeenCalledWith(1, 3);
    expect(chunkClose).toHaveBeenCalledOnce();
    await reader.close();
    expect(sourceClose).toHaveBeenCalledOnce();
  });
});

describe("selection and permissions", () => {
  it("keeps the browser File returned by H5 image selection", async () => {
    const uni = runtime();
    const file = new File(["abc"], "original.jpg");
    uni.getSystemInfoSync = () => ({ uniPlatform: "web" });
    uni.chooseImage = vi.fn((options) => {
      expect(options.sizeType).toEqual(["original"]);
      options.success({
        tempFilePaths: ["blob:local"],
        tempFiles: [{ file, size: 3 }],
      });
    });
    expect(await chooseImages({ uni })).toEqual([
      { name: "original.jpg", path: "blob:local", sourceFile: file },
    ]);
  });

  it("opens the H5 picker synchronously and skips native permission checks", async () => {
    const uni = runtime();
    uni.getSystemInfoSync = () => ({ uniPlatform: "web" });
    const beforeChoose = vi.fn(async () => undefined);
    uni.chooseImage = vi.fn((options) =>
      options.success({ tempFilePaths: [], tempFiles: [] })
    );

    const selection = chooseImages({ beforeChoose, uni });

    expect(uni.chooseImage).toHaveBeenCalledOnce();
    expect(beforeChoose).not.toHaveBeenCalled();
    await expect(selection).resolves.toEqual([]);
  });

  it("checks business permissions before native selection", async () => {
    const uni = runtime();
    uni.getSystemInfoSync = () => ({ uniPlatform: "mp-weixin" });
    const beforeChoose = vi.fn(async () => undefined);
    uni.chooseImage = vi.fn((options) => {
      expect(beforeChoose).toHaveBeenCalledOnce();
      options.success({ tempFilePaths: [], tempFiles: [] });
    });
    await chooseImages({ beforeChoose, uni });
  });

  it("does not open the picker if a business check rejects", async () => {
    const uni = runtime();
    uni.getSystemInfoSync = () => ({ uniPlatform: "mp-weixin" });
    uni.chooseImage = vi.fn();
    await expect(
      chooseImages({
        beforeChoose: async () => {
          throw new Error("privacy denied");
        },
        uni,
      })
    ).rejects.toThrow("privacy denied");
    expect(uni.chooseImage).not.toHaveBeenCalled();
  });

  it("distinguishes selection cancellation", async () => {
    const uni = runtime();
    uni.chooseImage = (options) =>
      options.fail({ errMsg: "chooseImage:fail cancel" });
    await expect(chooseImages({ uni })).rejects.toMatchObject({
      name: "SelectionCancelledError",
    });
  });

  it("requests undetermined mini-program scopes, rejects denied scopes without settings UI", async () => {
    const uni = runtime();
    uni.getSetting = (options) => options.success({ authSetting: {} });
    uni.authorize = vi.fn((options) => options.success({}));
    expect(
      await ensurePermission("scope.camera", { platform: "mp", uni })
    ).toBe("authorized");
    uni.getSetting = (options) =>
      options.success({ authSetting: { "scope.camera": false } });
    uni.openSetting = vi.fn();
    await expect(
      ensurePermission("scope.camera", { platform: "mp", uni })
    ).rejects.toMatchObject({ name: "PermissionError" });
    expect(uni.openSetting).not.toHaveBeenCalled();
  });

  it("leaves App prompts to the picker and reports H5 checks as unsupported", async () => {
    const uni = runtime();
    uni.getAppAuthorizeSetting = () => ({
      albumAuthorized: "denied",
      cameraAuthorized: "not determined",
    });
    expect(await ensurePermission("camera", { platform: "app", uni })).toBe(
      "undetermined"
    );
    await expect(
      ensurePermission("album", { platform: "app", uni })
    ).rejects.toMatchObject({ name: "PermissionError" });
    expect(await checkPermission("camera", { platform: "h5", uni })).toBe(
      "unsupported"
    );
    await expect(
      openPermissionSettings({ platform: "h5", uni })
    ).rejects.toThrow("unavailable");
  });
});

describe("native form upload", () => {
  it("uses uni.uploadFile with formData, progress and cancellation", async () => {
    const uni = runtime();
    const abort = vi.fn();
    uni.uploadFile = vi.fn((options) => {
      options.success({ data: '{"uid":"file"}', statusCode: 201 });
      return {
        abort,
        onProgressUpdate: (callback) =>
          callback({
            progress: 50,
            totalBytesExpectedToSend: 4,
            totalBytesSent: 2,
          }),
      };
    });
    const progress = vi.fn();
    const task = uploadFormFile("/tmp/file", {
      formData: { folder: "photos" },
      name: "image",
      onProgress: progress,
      uni,
      url: "https://api/form",
    });
    expect(await task.result).toEqual({
      data: '{"uid":"file"}',
      statusCode: 201,
    });
    expect(uni.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: "/tmp/file",
        formData: { folder: "photos" },
        name: "image",
      })
    );
    expect(progress).toHaveBeenCalledWith({ loaded: 2, percent: 50, total: 4 });
    task.abort();
    expect(abort).not.toHaveBeenCalled();
    expect(uni.request).not.toHaveBeenCalled();
  });

  it("lets native uploadFile set the multipart boundary", () => {
    const uni = runtime();
    uni.uploadFile = vi.fn();
    expect(() =>
      uploadFormFile("/tmp/file", {
        headers: { "content-type": "multipart/form-data" },
        uni,
        url: "url",
      })
    ).toThrow("boundary");
    expect(uni.uploadFile).not.toHaveBeenCalled();
  });

  it("does not resolve HTTP failures as successful form uploads", async () => {
    const uni = runtime();
    uni.uploadFile = (options) => {
      options.success({ data: "too large", statusCode: 413 });
      return { abort: () => undefined, onProgressUpdate: () => undefined };
    };
    await expect(
      uploadFormFile("/tmp/file", { uni, url: "url" }).result
    ).rejects.toMatchObject({ status: 413 });
  });
});

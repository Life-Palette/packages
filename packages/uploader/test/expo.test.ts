import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExpoUploader } from "../src/expo/index";

const expoFile = vi.hoisted(() => ({
  paths: [] as string[],
  digest: vi.fn(async (algorithm: string) => {
    if (algorithm !== "MD5") {
      throw new Error(`Unexpected digest algorithm: ${algorithm}`);
    }
    return "expo-md5";
  }),
}));

vi.mock("expo-file-system", () => ({
  File: class {
    readonly size = 3;

    constructor(path: string) {
      expoFile.paths.push(path);
    }

    digest = expoFile.digest;

    open() {
      const bytes = new Uint8Array([1, 2, 3]);
      return {
        close: vi.fn(),
        offset: 0,
        readBytes(length: number) {
          return bytes.slice(this.offset, this.offset + length);
        },
      };
    }
  },
  FileMode: { ReadOnly: 1 },
}));

function jsonResponse(data: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify({ data }), { headers, status: 200 });
}

describe("Expo uploader adapter", () => {
  beforeEach(() => {
    expoFile.paths.length = 0;
    expoFile.digest.mockClear();
  });

  it("reads an Expo file and completes a direct upload", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ init, url });
      if (url.endsWith("/uploads")) {
        return jsonResponse({
          id: "expo-upload-1",
          mode: "direct",
          size: 3,
          total_parts: 1,
          upload: {
            method: "PUT",
            url: "https://storage.example.com/photo.png",
          },
        });
      }
      if (url === "https://storage.example.com/photo.png") {
        return new Response(null, { headers: { ETag: '"expo-etag"' } });
      }
      if (url.endsWith("/uploads/expo-upload-1/complete")) {
        return jsonResponse({
          file_md5: "expo-md5",
          is_private: false,
          name: "photo.png",
          size: 3,
          type: "image/png",
          uid: "expo-file-1",
          url: "https://storage.example.com/photo.png",
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const uploaded = await createExpoUploader({
      apiBaseUrl: "https://api.example.com/api/v1/",
      fetch: fetchMock as typeof fetch,
      getToken: () => "expo-token",
      retryDelayMs: 0,
    }).upload({ name: "photo.png", path: "file:///photo.png" });

    expect(uploaded.uid).toBe("expo-file-1");
    expect(expoFile.paths).toEqual(["file:///photo.png"]);
    expect(expoFile.digest).toHaveBeenCalledWith("MD5");
    expect(calls).toHaveLength(3);
    expect(new Headers(calls[0]?.init.headers).get("Authorization")).toBe(
      "Bearer expo-token"
    );
    expect(new Headers(calls[1]?.init.headers).has("Authorization")).toBe(
      false
    );
    expect(new Headers(calls[1]?.init.headers).get("Content-Type")).toBe(
      "application/octet-stream"
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      checksum: "expo-md5",
      file_name: "photo.png",
      size: 3,
    });
    expect(JSON.parse(String(calls[2]?.init.body))).toMatchObject({
      is_private: false,
      parts: [],
    });
  });
});

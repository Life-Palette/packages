import { describe, expect, it, vi } from "vitest";
import { createUploaderV2, type UploadV2Session } from "../src/uploader-v2";

function response(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { headers, status });
}

function file() {
  return new File([new Uint8Array([1, 2, 3])], "photo.jpg", {
    type: "image/jpeg",
  });
}

describe("createUploaderV2", () => {
  it("uploads a direct session and completes with the new contract", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/uploads")) {
        const session: UploadV2Session = {
          id: "upload-1",
          mode: "direct",
          key: "go_api/photo.jpg",
          file_name: "photo.jpg",
          content_type: "image/jpeg",
          size: 3,
          total_parts: 1,
          upload: {
            method: "PUT",
            url: "https://s3.example.com/photo.jpg",
            key: "go_api/photo.jpg",
            expires_at: 1,
          },
        };
        return response({ code: 200, data: session });
      }
      if (url === "https://s3.example.com/photo.jpg") {
        return response({}, 200, { ETag: '"etag-1"' });
      }
      if (url.endsWith("/uploads/upload-1/complete")) {
        return response({
          code: 200,
          data: {
            uid: "file-1",
            name: "photo.jpg",
            file_md5: "md5-1",
            size: 3,
            type: "image/jpeg",
            url: "https://s3.example.com/photo.jpg",
            is_private: false,
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await createUploaderV2({
      apiBaseUrl: "https://api.example.com/api/v1",
      getToken: () => "token",
      fetch: fetchMock as typeof fetch,
    }).upload(file(), { checksum: "md5-1" });

    expect(result.uid).toBe("file-1");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      file_name: "photo.jpg",
      size: 3,
      checksum: "md5-1",
    });
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({
      parts: [],
      is_private: false,
    });
  });

  it("uploads multipart parts and resumes already uploaded parts", async () => {
    const uploadedParts: number[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/uploads")) {
        const session: UploadV2Session = {
          id: "upload-2",
          mode: "multipart",
          key: "go_api/video.mov",
          file_name: "video.mov",
          content_type: "video/quicktime",
          size: 6,
          part_size: 3,
          total_parts: 2,
          uploaded_parts: [{ part_number: 1, etag: "existing" }],
          parts: [
            { part_number: 1, url: "https://s3.example.com/part-1", expires_at: 1 },
            { part_number: 2, url: "https://s3.example.com/part-2", expires_at: 1 },
          ],
        };
        return response({ data: session });
      }
      if (url.endsWith("/part-2")) {
        uploadedParts.push(2);
        return response({}, 200, { ETag: '"part-2-etag"' });
      }
      if (url.endsWith("/uploads/upload-2/complete")) {
        return response({ data: { uid: "file-2", name: "video.mov" } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await createUploaderV2({
      apiBaseUrl: "https://api.example.com/api/v1",
      getToken: () => null,
      fetch: fetchMock as typeof fetch,
      partConcurrency: 1,
    }).upload(new File([new Uint8Array(6)], "video.mov"), {
      checksum: "md5-2",
    });

    expect(result.uid).toBe("file-2");
    expect(uploadedParts).toEqual([2]);
  });

  it("returns an existing file without uploading again", async () => {
    const fetchMock = vi.fn(async () =>
      response({
        data: {
          id: "",
          mode: "direct",
          key: "go_api/photo.jpg",
          file_name: "photo.jpg",
          content_type: "image/jpeg",
          size: 3,
          total_parts: 1,
          existing_file: { uid: "existing-1", name: "photo.jpg" },
        },
      })
    );

    const result = await createUploaderV2({
      apiBaseUrl: "https://api.example.com/api/v1",
      getToken: () => null,
      fetch: fetchMock as typeof fetch,
    }).upload(file(), { checksum: "same-md5" });

    expect(result.uid).toBe("existing-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

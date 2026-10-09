import { describe, expect, it, vi } from "vitest";
import { createOssUploader, type UploadSession } from "../src/uploader";

function response(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { headers, status });
}

function file() {
  return new File([new Uint8Array([1, 2, 3])], "photo.jpg", {
    type: "image/jpeg",
  });
}

describe("createOssUploader", () => {
  it("uploads a direct session and completes with the new contract", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ init, url });
      if (url.endsWith("/uploads")) {
        const session: UploadSession = {
          content_type: "image/jpeg",
          file_name: "photo.jpg",
          id: "upload-1",
          key: "go_api/photo.jpg",
          mode: "direct",
          size: 3,
          total_parts: 1,
          upload: {
            expires_at: 1,
            key: "go_api/photo.jpg",
            method: "PUT",
            url: "https://s3.example.com/photo.jpg",
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
            file_md5: "md5-1",
            is_private: false,
            name: "photo.jpg",
            size: 3,
            type: "image/jpeg",
            uid: "file-1",
            url: "https://s3.example.com/photo.jpg",
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await createOssUploader({
      apiBaseUrl: "https://api.example.com/api/v1",
      fetch: fetchMock as typeof fetch,
      getToken: () => "token",
    }).upload(file(), { checksum: "md5-1" });

    expect(result.uid).toBe("file-1");
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe(
      "Bearer token"
    );
    expect(new Headers(calls[1].init?.headers).has("Authorization")).toBe(
      false
    );
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      checksum: "md5-1",
      file_name: "photo.jpg",
      size: 3,
    });
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({
      is_private: false,
      parts: [],
    });
  });

  it("uploads multipart parts and resumes already uploaded parts", async () => {
    const uploadedParts: number[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/uploads")) {
        const session: UploadSession = {
          content_type: "video/quicktime",
          file_name: "video.mov",
          id: "upload-2",
          key: "go_api/video.mov",
          mode: "multipart",
          part_size: 3,
          parts: [
            {
              expires_at: 1,
              part_number: 1,
              url: "https://s3.example.com/part-1",
            },
            {
              expires_at: 1,
              part_number: 2,
              url: "https://s3.example.com/part-2",
            },
          ],
          size: 6,
          total_parts: 2,
          uploaded_parts: [{ etag: "existing", part_number: 1 }],
        };
        return response({ data: session });
      }
      if (url.endsWith("/part-2")) {
        uploadedParts.push(2);
        return response({}, 200, { ETag: '"part-2-etag"' });
      }
      if (url.endsWith("/uploads/upload-2/complete")) {
        return response({ data: { name: "video.mov", uid: "file-2" } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await createOssUploader({
      apiBaseUrl: "https://api.example.com/api/v1",
      fetch: fetchMock as typeof fetch,
      getToken: () => null,
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
          content_type: "image/jpeg",
          existing_file: { name: "photo.jpg", uid: "existing-1" },
          file_name: "photo.jpg",
          id: "",
          key: "go_api/photo.jpg",
          mode: "direct",
          size: 3,
          total_parts: 1,
        },
      })
    );

    const result = await createOssUploader({
      apiBaseUrl: "https://api.example.com/api/v1",
      fetch: fetchMock as typeof fetch,
      getToken: () => null,
    }).upload(file(), { checksum: "same-md5" });

    expect(result.uid).toBe("existing-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

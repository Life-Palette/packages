import { getChunkRanges, openUploadFile } from "@life-palette/uploader-uniapp";
import init, {
  extractMeta,
  extractMetaBatch,
  extractMetaFast,
  extractMetaFastSized,
  type MediaMeta,
} from "metaprobe/miniprogram";

interface Fixture {
  data?: number[];
  exif?: Record<string, string>;
  expected: Record<string, unknown>;
  name: string;
  path?: string;
  sha256: string;
}

export interface ValidationReport {
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  environment: { platform: string; system: string; SDKVersion: string };
  error?: string;
  status: "passed" | "failed";
}

function initialize() {
  return init({ wasmPath: "static/uploader-uniapp/metaprobe.wasm" });
}

async function readFile(
  path: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  // Large readFile ArrayBuffers can fail inside the DevTools base64 bridge
  // before either callback is invoked. Reuse the uploader's native range reader.
  const reader = await openUploadFile({ path }, { platform: "mp" });
  try {
    const bytes = new Uint8Array(reader.size);
    onProgress?.(0, reader.size);
    for (const { start, end } of getChunkRanges(reader.size, 1024 * 1024)) {
      bytes.set(new Uint8Array(await reader.read(start, end)), start);
      onProgress?.(end, reader.size);
    }
    return bytes.buffer;
  } finally {
    await reader.close();
  }
}

function readFixtures(): Promise<Fixture[]> {
  return new Promise((resolve, reject) => {
    uni.getFileSystemManager().readFile({
      encoding: "utf8",
      fail: (error) => reject(new Error(error.errMsg)),
      filePath: "static/metaprobe/fixtures.json",
      success: (result) => {
        try {
          resolve(JSON.parse(String(result.data)) as Fixture[]);
        } catch (error) {
          reject(error);
        }
      },
    });
  });
}

export async function runMetaprobeChecks(): Promise<ValidationReport> {
  const system = uni.getSystemInfoSync();
  const report: ValidationReport = {
    checks: [],
    environment: {
      platform: system.platform,
      SDKVersion: system.SDKVersion,
      system: system.system,
    },
    status: "failed",
  };
  const check = (name: string, passed: boolean, detail?: string) => {
    report.checks.push({ name, passed, ...(detail ? { detail } : {}) });
  };
  try {
    await Promise.all([initialize(), initialize()]);
    check("WXWebAssembly 加载与并发初始化", true);
    const fixtures = await readFixtures();
    check("小程序文件系统读取测试数据", fixtures.length === 4);
    const inputs: Array<{ data: Uint8Array; filename: string }> = [];
    for (const fixture of fixtures) {
      const bytes = fixture.path
        ? new Uint8Array(await readFile(fixture.path))
        : new Uint8Array(fixture.data ?? []);
      inputs.push({ data: bytes, filename: fixture.name });
      const fast = extractMetaFastSized(bytes, fixture.name, bytes.length);
      for (const [key, value] of Object.entries(fixture.expected)) {
        check(
          `${fixture.name} · ${key}`,
          fast[key as keyof MediaMeta] === value
        );
      }
      for (const [key, value] of Object.entries(fixture.exif ?? {})) {
        check(`EXIF · ${key}`, fast.exif[key]?.includes(value) ?? false);
      }
      check(
        `${fixture.name} · SHA-256`,
        extractMeta(bytes, fixture.name).fileHash === fixture.sha256
      );
      check(
        `${fixture.name} · 快速模式不计算哈希`,
        extractMetaFast(bytes, fixture.name).fileHash === undefined
      );
      if (fast.kind === "video") {
        check(
          "视频原始大小与码率",
          extractMetaFastSized(bytes, fixture.name, 1_000_000)
            .overallBitrate === 3_200_000
        );
      }
    }
    const batch = extractMetaBatch([
      ...inputs,
      { data: new Uint8Array([1, 2, 3]), filename: "损坏.data" },
    ]);
    check(
      "批量解析与错误隔离",
      batch.length === 5 &&
        batch.every((item, index) => item.success === index < 4)
    );
    let rejected = false;
    try {
      extractMetaFast(new Uint8Array([1, 2, 3]), "broken.data");
    } catch {
      rejected = true;
    }
    check("无效文件返回解析错误", rejected);
    report.status = report.checks.every((item) => item.passed)
      ? "passed"
      : "failed";
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }
  return report;
}

export async function analyzeLocalFile(
  path: string,
  name: string,
  onProgress?: (status: string) => void
): Promise<MediaMeta> {
  onProgress?.("正在加载解析器");
  await initialize();
  const bytes = new Uint8Array(
    await readFile(path, (loaded, total) => {
      onProgress?.(
        `读取文件 ${Math.round((loaded / Math.max(total, 1)) * 100)}%`
      );
    })
  );
  onProgress?.("正在解析元数据");
  return extractMetaFastSized(bytes, name, bytes.byteLength);
}

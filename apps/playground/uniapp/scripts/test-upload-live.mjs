import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { connectWechat } from './wechat-automation.mjs'

const base = process.env.LP_API_BASE || 'http://localhost:9530/api/v1'
assert.ok(process.env.LP_TEST_ACCOUNT && process.env.LP_TEST_PASSWORD, 'Supply LP_TEST_ACCOUNT and LP_TEST_PASSWORD in this process environment')
const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: process.env.LP_TEST_ACCOUNT, password: process.env.LP_TEST_PASSWORD }) })
const login = await response.json()
assert.equal(response.status, 200, login.message || 'Login failed')
const token = login.data?.access_token
assert.ok(token, 'Login response is missing access_token')
console.log('Authenticated against local lp-server (token remains in memory).')
const { call, close } = await connectWechat()
const results = []
try {
  for (const testCase of ['direct', 'multipart', 'compression']) {
    console.log(`Testing ${testCase} with the native mini-program network/filesystem...`)
    const response = await call('App.callFunction', {
      args: [base, token, testCase],
      functionDeclaration: `async function (base, token, testCase) {
        const api = require("common/vendor.js").index;
        const workflow = require("utils/upload-workflow.js");
        const fs = api.getFileSystemManager();
        const marker = "lp-uploader-e2e-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        const path = api.env.USER_DATA_PATH + "/" + marker + ".jpg";
        const originalRequest = api.request;
        const trace = [];
        const createdUIDs = new Set();
        let created = false;
        let sessionId;
        let summary;
        const apiRequest = async (route, method = "GET") => await new Promise((resolve, reject) => originalRequest.call(api, {
          url: base + route, method, header: {Authorization: "Bearer " + token},
          success: r => { try { const body = typeof r.data === "string" ? JSON.parse(r.data) : r.data; if (r.statusCode < 200 || r.statusCode >= 300) reject(new Error(body?.message || "HTTP " + r.statusCode)); else resolve(body?.data); } catch (error) { reject(error); } }, fail: reject
        }));
        api.request = function (options) {
          const isAPI = options.url.startsWith(base);
          const isInit = isAPI && options.url.endsWith("/uploads");
          const isComplete = isAPI && options.url.endsWith("/complete");
          const item = { method: options.method, kind: isInit ? "initialize" : isComplete ? "complete" : isAPI ? "api" : "storage", hasAuth: !!options.header?.Authorization };
          if (isComplete) item.hasMetadata = !!options.data?.metadata;
          trace.push(item);
          return originalRequest.call(api, {...options, success(r) {
            item.status = r.statusCode;
            if (isAPI) {
              const body = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
              if (isInit && body.data) { item.mode = body.data.mode; item.deduplicated = !!body.data.existing_file; if (body.data.id) sessionId = body.data.id; }
              if (isComplete && body.data?.uid) createdUIDs.add(body.data.uid);
            }
            options.success?.(r);
          }});
        };
        try {
          fs.writeFileSync(path, fs.readFileSync("static/uploader-uniapp/metadata-fixture.jpg"));
          created = true;
          const size = testCase === "multipart" ? 6 * 1024 * 1024 : testCase === "compression" ? 2 * 1024 * 1024 : 0;
          let written = fs.statSync(path).size;
          const chunk = new ArrayBuffer(1024 * 1024);
          while (written < size) { const length = Math.min(size - written, chunk.byteLength); fs.appendFileSync(path, length === chunk.byteLength ? chunk : chunk.slice(0, length)); written += length; }
          fs.appendFileSync(path, marker, "utf8");
          const sourceSize = fs.statSync(path).size;
          const options = { apiBaseUrl: base, token, platform: "mp", isPrivate: true, compress: testCase === "compression", maxSizeMB: 0.01 };
          const uploaded = await workflow.uploadMediaFile({path, name: marker + ".jpg"}, options);
          const persisted = await apiRequest("/files/" + uploaded.uploaded.uid);
          const metadata = uploaded.metadata;
          if (testCase === "direct") {
            const repeated = await workflow.uploadMediaFile({path, name: marker + ".jpg"}, options);
            if (repeated.uploaded.uid !== uploaded.uploaded.uid) throw new Error("Instant upload returned a different file");
          }
          summary = { testCase, uid: uploaded.uploaded.uid, sourceSize, uploadedSize: metadata.basic.size,
            checks: { dimensions: persisted.width === metadata.basic.width && persisted.height === metadata.basic.height,
              md5: persisted.file_md5 === metadata.basic.md5, size: persisted.size === metadata.basic.size,
              blurhash: !!persisted.blurhash && persisted.blurhash === metadata.image.blurhash,
              arthash: !!persisted.arthash && persisted.arthash === metadata.image.arthash,
              arthashCodec: persisted.arthash_codec === "rect-v64", exif: persisted.device_make === "TestCam" && !!persisted.taken_at,
              colors: Array.isArray(persisted.colors) && persisted.colors.length === metadata.image.colors.length && persisted.colors.length > 0,
              private: persisted.is_private === true,
              compressed: testCase !== "compression" || metadata.basic.size < sourceSize,
              metadataSent: trace.some(t => t.kind === "complete" && t.hasMetadata),
              storageHasNoAuth: trace.filter(t => t.kind === "storage").every(t => !t.hasAuth),
              mode: trace.some(t => t.kind === "initialize" && t.mode === (testCase === "multipart" ? "multipart" : "direct")),
              instantUpload: testCase !== "direct" || trace.some(t => t.deduplicated)
            }, trace };
        } catch (error) {
          summary = {testCase, error: String(error), trace};
        } finally {
          api.request = originalRequest;
          const cleanup = [];
          for (const uid of createdUIDs) {
            try { await apiRequest("/files/" + uid, "DELETE"); let removed = false; try { await apiRequest("/files/" + uid); } catch { removed = true; } cleanup.push({uid, removed}); }
            catch (error) { cleanup.push({uid, removed:false, error:String(error)}); }
          }
          if (!createdUIDs.size && sessionId) { try { await apiRequest("/uploads/" + encodeURIComponent(sessionId), "DELETE"); } catch (error) { cleanup.push({sessionAborted:false,error:String(error)}); } }
          if (created) fs.unlinkSync(path);
          summary = {...summary, cleanup};
        }
        return summary;
      }`,
    })
    const result = response.result
    results.push(result)
    console.log(JSON.stringify(result, null, 2))
    await mkdir('dist/upload-validation', { recursive: true })
    await writeFile('dist/upload-validation/report.json', JSON.stringify({ base, results }, null, 2))
    assert.equal(result.error, undefined, result.error)
    assert.ok(Object.values(result.checks).every(Boolean), `Failed checks for ${testCase}`)
    assert.ok(result.cleanup.every(item => item.removed), 'Test file cleanup failed')
  }
  console.log('PASS: real direct/multipart/instant uploads, compression, persisted metadata and cleanup.')
} finally {
  close()
}

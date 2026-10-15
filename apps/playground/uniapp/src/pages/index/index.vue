<script setup lang="ts">
import {
  chooseImages,
  ensurePermission,
  getChunkRanges,
  getFileInfo,
  openPermissionSettings,
  PermissionError,
  SelectionCancelledError,
  type UniPlatform,
  UploadCancellation,
  UploadCancelledError,
  type UploadedFile,
  type UploadFile,
  uploadFormFile,
} from "@life-palette/uploader-uniapp";
import { onMounted, ref, watch } from "vue";
import { uploadMediaFile } from "../../utils/upload-workflow";

let platform: UniPlatform = "h5";
// #ifdef MP
platform = "mp";
// #endif
// #ifdef APP-PLUS
platform = "app";
// #endif
const apiBaseUrl = ref("http://localhost:9530/api/v1");
const tokenStorageKey = "life-palette.playground.uniapp.auth-token";
const storedToken: unknown = uni.getStorageSync(tokenStorageKey);
const token = ref(typeof storedToken === "string" ? storedToken : "");
watch(token, (value) => {
  if (value.trim()) {
    uni.setStorageSync(tokenStorageKey, value.trim());
  } else {
    uni.removeStorageSync(tokenStorageKey);
  }
});
const formUrl = ref("");
const files = ref<UploadFile[]>([]);
const busy = ref(false);
const uploading = ref(false);
let cancellation: UploadCancellation | undefined;
const stage = ref("");
const percent = ref(0);
const error = ref("");
const result = ref("");
const denied = ref(false);
const isPrivate = ref(false);
const compressBeforeUpload = ref(false);
const chunkSizeMB = ref(5);
const source = ref<"album" | "camera">("album");

const fileList = ref<UploadedFile[]>([]);
const loadingFiles = ref(false);
const fileListError = ref("");
const deletingUID = ref("");
const pendingDeleteUID = ref("");

function fileRequest<T>(
  path: string,
  method: "GET" | "DELETE" = "GET"
): Promise<T> {
  const auth = token.value.replace(/^Bearer\s+/i, "").trim();
  return new Promise((resolve, reject) => {
    uni.request({
      fail: (reason) => reject(new Error(reason.errMsg || "请求失败")),
      header: {
        Accept: "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      method,
      success: (response) => {
        try {
          const body = (
            typeof response.data === "string"
              ? JSON.parse(response.data)
              : response.data
          ) as { data?: T; message?: string } | null;
          if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(
              body?.message || `请求失败（${response.statusCode}）`
            );
          }
          resolve(body?.data as T);
        } catch (reason) {
          reject(reason);
        }
      },
      url: `${apiBaseUrl.value.replace(/\/$/, "")}${path}`,
    });
  });
}

async function loadFiles() {
  if (loadingFiles.value) {
    return;
  }
  loadingFiles.value = true;
  fileListError.value = "";
  try {
    const page = await fileRequest<{ list: UploadedFile[] }>(
      "/files?page=1&page_size=100&sort=created_at,desc"
    );
    fileList.value = page?.list ?? [];
  } catch (reason) {
    fileListError.value =
      reason instanceof Error ? reason.message : String(reason);
  } finally {
    loadingFiles.value = false;
  }
}

async function deleteFile(file: UploadedFile) {
  if (deletingUID.value || !token.value.trim()) {
    return;
  }
  if (pendingDeleteUID.value !== file.uid) {
    pendingDeleteUID.value = file.uid;
    return;
  }
  pendingDeleteUID.value = "";
  deletingUID.value = file.uid;
  fileListError.value = "";
  try {
    await fileRequest(`/files/${encodeURIComponent(file.uid)}`, "DELETE");
    fileList.value = fileList.value.filter((item) => item.uid !== file.uid);
  } catch (reason) {
    fileListError.value =
      reason instanceof Error ? reason.message : String(reason);
  } finally {
    deletingUID.value = "";
  }
}

onMounted(loadFiles);
watch([apiBaseUrl, token], () => {
  fileList.value = [];
  pendingDeleteUID.value = "";
  fileListError.value = "";
});

function onPrivateChange(event: Event | { detail: { value: boolean } }) {
  if ("detail" in event) {
    isPrivate.value = event.detail.value;
  }
}
function onCompressionChange(event: Event | { detail: { value: boolean } }) {
  if ("detail" in event) compressBeforeUpload.value = event.detail.value;
}

async function select() {
  error.value = "";
  denied.value = false;
  try {
    files.value = await chooseImages({
      beforeChoose: async () => {
        if (platform === "app") {
          await ensurePermission(source.value, { platform });
        }
        // Album picking has no writePhotosAlbum requirement. Native picker handles privacy prompts.
      },
      sourceType: [source.value],
    });
    result.value = "";
  } catch (reason) {
    if (reason instanceof SelectionCancelledError) {
      return;
    }
    denied.value = reason instanceof PermissionError;
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
}

async function inspectFile() {
  const file = files.value[0];
  if (!file) {
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const info = await getFileInfo(file, { platform });
    const chunks = getChunkRanges(
      info.size,
      Math.round(chunkSizeMB.value * 1024 * 1024)
    );
    result.value = JSON.stringify(
      { ...info, chunks, totalParts: chunks.length },
      null,
      2
    );
    stage.value = "文件信息已获取";
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    busy.value = false;
  }
}

async function settings() {
  try {
    await openPermissionSettings({ platform });
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
}

async function upload(form: boolean) {
  cancellation = new UploadCancellation();
  uploading.value = true;
  busy.value = true;
  error.value = "";
  result.value = "";
  percent.value = 0;
  const auth = token.value.replace(/^Bearer\s+/i, "").trim();
  try {
    const responses: unknown[] = [];
    for (const [index, file] of files.value.entries()) {
      cancellation.throwIfAborted();
      stage.value = `${index + 1}/${files.value.length}`;
      if (form) {
        const task = uploadFormFile(file, {
          cancellation,
          headers: auth ? { Authorization: `Bearer ${auth}` } : {},
          onProgress: (progress) => {
            percent.value = progress.percent;
          },
          url: formUrl.value,
        });
        responses.push(await task.result);
      } else {
        responses.push(
          (await uploadMediaFile(file, {
            apiBaseUrl: apiBaseUrl.value,
            token: auth,
            platform,
            compress: compressBeforeUpload.value,
            cancellation,
            isPrivate: isPrivate.value,
            onProgress: (progress) => {
              stage.value = `${index + 1}/${files.value.length} · ${progress.stage}`;
              percent.value = progress.percent;
            },
          })).uploaded
        );
      }
    }
    result.value = JSON.stringify(responses, null, 2);
    stage.value = "上传完成";
    percent.value = 100;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
    stage.value =
      reason instanceof UploadCancelledError ? "上传已取消" : "上传失败";
  } finally {
    cancellation = undefined;
    uploading.value = false;
    busy.value = false;
    await loadFiles();
  }
}
</script>

<template>
  <view class="page">
    <text class="title">uni-app 文件上传</text>
    <navigator url="/pages/metaprobe/index"><button size="mini">metaprobe 小程序验证</button></navigator>
    <text class="note">选择文件后单独上传。服务端决定直传或分片模式。</text>
    <view class="layout">
    <view class="upload-column">
    <view class="panel">
      <text>API 地址</text><input v-model="apiBaseUrl" placeholder="https://api.example.com/api/v1" :disabled="busy" />
      <text>Token（本地保存，清空即删除）</text><input v-model="token" :maxlength="-1" password placeholder="访问令牌" :disabled="busy" />
      <view class="row"><text>私有文件</text><switch :checked="isPrivate" :disabled="busy" @change="onPrivateChange" /></view>
      <view class="row"><text>上传前压缩（保留 EXIF）</text><switch :checked="compressBeforeUpload" :disabled="busy" @change="onCompressionChange" /></view>
      <view class="row"><button size="mini" :disabled="busy" @click="source = 'album'; select()">相册</button><button size="mini" :disabled="busy" @click="source = 'camera'; select()">拍照</button></view>
      <view v-for="file in files" :key="file.path" class="file"><image :src="file.path" mode="aspectFill" /><text>{{ file.name || file.path }}</text></view>
      <button class="primary" :disabled="busy || !files.length || !apiBaseUrl" @click="upload(false)">上传（自动直传 / 分片）</button>
    </view>
    <view class="panel">
      <text>独立文件工具 · 分片大小（MiB）</text>
      <input v-model.number="chunkSizeMB" type="digit" :disabled="busy" />
      <button :disabled="busy || !files.length" @click="inspectFile">获取 MD5 / 大小 / 分片范围</button>
    </view>
    <view class="panel">
      <text>表单上传地址</text><input v-model="formUrl" placeholder="支持 multipart/form-data POST 的地址" :disabled="busy" />
      <button :disabled="busy || !files.length || !formUrl" @click="upload(true)">普通表单上传</button>
    </view>
    <button v-if="uploading" @click="cancellation?.cancel()">取消上传</button>
    <text v-if="stage">{{ stage }}</text><progress :percent="percent" show-info />
    <text v-if="error" class="error">{{ error }}</text>
    <button v-if="denied" @click="settings">打开权限设置</button>
    <text v-if="result" class="result" selectable>{{ result }}</text>
    </view>
    <view class="panel file-list-panel">
      <view class="list-heading"><text class="list-title">文件列表</text><button size="mini" :disabled="loadingFiles || !!deletingUID" @click="loadFiles">{{ loadingFiles ? "刷新中" : "刷新列表" }}</button></view>
      <text class="list-note">上传后自动刷新。删除需要有效 Token，并再次确认。</text>
      <text v-if="fileListError" class="error">{{ fileListError }}</text>
      <text v-if="!loadingFiles && !fileList.length && !fileListError" class="list-note">暂无文件，填写 Token 后可刷新查看私有文件。</text>
      <view v-for="file in fileList" :key="file.uid" class="list-item">
        <view class="list-main"><text class="list-name" selectable>{{ file.name }}</text><text class="list-note">{{ file.size }} B · {{ file.is_private ? "私有" : "公开" }}</text></view>
        <view class="list-actions">
          <button size="mini" class="danger" :disabled="busy || !!deletingUID || !token.trim()" @click="deleteFile(file)">{{ deletingUID === file.uid ? "删除中" : pendingDeleteUID === file.uid ? "确认删除" : "删除" }}</button>
          <button v-if="pendingDeleteUID === file.uid" size="mini" :disabled="!!deletingUID" @click="pendingDeleteUID = ''">取消</button>
        </view>
      </view>
    </view>
    </view>
  </view>
</template>

<style>
.page { padding: 32rpx; color: #24352b; background: #f5f7f3; min-height: 100vh; box-sizing: border-box; }
.layout { display: flex; flex-wrap: wrap; gap: 24rpx; align-items: flex-start; }
.upload-column { flex: 1 1 640rpx; min-width: 0; }
.file-list-panel { flex: 1 1 540rpx; min-width: 0; }
.list-heading { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.list-heading button { margin: 0; }
.list-title { font-size: 34rpx; font-weight: 600; }
.list-note { display: block; color: #617269; font-size: 24rpx; margin: 12rpx 0; }
.list-item { border-top: 1px solid #e3e8e3; padding: 20rpx 0; }
.list-name { display: block; overflow-wrap: anywhere; }
.list-actions { display: flex; gap: 16rpx; }
.list-actions button { margin: 0; }
.danger { background: #fce9e5; color: #a82b2b; }
.title { display: block; font-size: 44rpx; font-weight: 600; margin-bottom: 16rpx; }
.note { display: block; color: #617269; margin-bottom: 24rpx; }
.panel { padding: 28rpx; margin-bottom: 24rpx; border-radius: 16rpx; background: white; }
input { border: 1px solid #dce3dd; padding: 16rpx; margin: 12rpx 0 24rpx; border-radius: 8rpx; }
.row { display: flex; align-items: center; gap: 20rpx; margin-bottom: 24rpx; }
.file { display: flex; gap: 16rpx; align-items: center; margin: 16rpx 0; overflow-wrap: anywhere; }
.file image { width: 96rpx; height: 96rpx; flex-shrink: 0; }
.primary { background: #317851; color: white; }
.error { display: block; color: #a82b2b; margin-top: 20rpx; }
.result { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font-family: monospace; margin-top: 24rpx; }
</style>

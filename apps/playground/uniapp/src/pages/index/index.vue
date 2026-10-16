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
    <view class="page-heading">
      <text class="title">文件上传</text>
      <wd-tag type="primary" variant="light">UniApp · MP</wd-tag>
    </view>
    <text class="note">选择媒体文件，自动直传或按需分片上传。</text>
    <view class="layout">
    <view class="upload-column">
    <wd-card title="服务与上传设置" custom-class="panel">
      <wd-cell-group border>
        <wd-cell title="API 地址" center>
          <wd-input v-model="apiBaseUrl" placeholder="https://api.example.com/api/v1" :disabled="busy" clearable />
        </wd-cell>
        <wd-cell title="Token" label="保存在本机，清空后删除" center>
          <wd-input v-model="token" type="text" show-password :maxlength="-1" placeholder="访问令牌" :disabled="busy" clearable />
        </wd-cell>
        <wd-cell title="私有文件" center>
          <wd-switch v-model="isPrivate" :disabled="busy" />
        </wd-cell>
        <wd-cell title="上传前压缩" label="尽量保留 EXIF 信息" center>
          <wd-switch v-model="compressBeforeUpload" :disabled="busy" />
        </wd-cell>
      </wd-cell-group>
      <view class="source-actions">
        <wd-button size="small" round variant="plain" icon="image" :disabled="busy" @click="source = 'album'; select()">从相册选择</wd-button>
        <wd-button size="small" round variant="plain" icon="camera" :disabled="busy" @click="source = 'camera'; select()">拍摄</wd-button>
      </view>
      <view v-for="file in files" :key="file.path" class="file"><wd-img :src="file.path" width="96rpx" height="96rpx" mode="aspectFill" :radius="8" :enable-preview="true" /><text>{{ file.name || file.path }}</text></view>
      <wd-button custom-class="primary" type="primary" block round icon="upload" :disabled="busy || !files.length || !apiBaseUrl" @click="upload(false)">上传（自动直传 / 分片）</wd-button>
    </wd-card>
    <wd-card title="文件检查" custom-class="panel">
      <wd-cell title="分片大小（MiB）" center>
        <wd-input v-model.number="chunkSizeMB" type="digit" :disabled="busy" />
      </wd-cell>
      <wd-button block round variant="plain" :disabled="busy || !files.length" @click="inspectFile">获取 MD5 / 大小 / 分片范围</wd-button>
    </wd-card>
    <wd-card title="普通表单上传" custom-class="panel">
      <wd-input v-model="formUrl" placeholder="支持 multipart/form-data POST 的地址" :disabled="busy" clearable />
      <wd-button block round variant="plain" :disabled="busy || !files.length || !formUrl" @click="upload(true)">普通表单上传</wd-button>
    </wd-card>
    <wd-button v-if="uploading" size="small" round variant="plain" @click="cancellation?.cancel()">取消上传</wd-button>
    <wd-cell v-if="stage" :title="stage" :value="`${percent}%`" />
    <wd-progress v-if="stage" :percentage="percent" />
    <text v-if="error" class="error">{{ error }}</text>
    <wd-button v-if="denied" round variant="plain" @click="settings">打开权限设置</wd-button>
    <text v-if="result" class="result" selectable>{{ result }}</text>
    </view>
    <wd-card title="文件列表" custom-class="panel file-list-panel">
      <view class="list-heading"><wd-button size="small" round variant="plain" :disabled="loadingFiles || !!deletingUID" @click="loadFiles">{{ loadingFiles ? "刷新中" : "刷新列表" }}</wd-button></view>
      <text class="list-note">上传后自动刷新。删除需要有效 Token，并再次确认。</text>
      <text v-if="fileListError" class="error">{{ fileListError }}</text>
      <text v-if="!loadingFiles && !fileList.length && !fileListError" class="list-note">暂无文件，填写 Token 后可刷新查看私有文件。</text>
      <view v-for="file in fileList" :key="file.uid" class="list-item">
        <view class="list-main"><text class="list-name" selectable>{{ file.name }}</text><text class="list-note">{{ file.size }} B · {{ file.is_private ? "私有" : "公开" }}</text></view>
        <view class="list-actions">
          <wd-button size="small" round type="danger" variant="soft" :disabled="busy || !!deletingUID || !token.trim()" @click="deleteFile(file)">{{ deletingUID === file.uid ? "删除中" : pendingDeleteUID === file.uid ? "确认删除" : "删除" }}</wd-button>
          <wd-button v-if="pendingDeleteUID === file.uid" size="small" round variant="plain" :disabled="!!deletingUID" @click="pendingDeleteUID = ''">取消</wd-button>
        </view>
      </view>
    </wd-card>
    </view>
  </view>
</template>

<style>
.page { box-sizing: border-box; min-height: 100vh; padding: 30rpx 28rpx 28rpx; color: #262626; background: #f5f6f8; }
.page-heading { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.title { display: block; font-size: 38rpx; font-weight: 650; line-height: 1.35; }
.note { display: block; margin: 10rpx 0 24rpx; color: #777; font-size: 23rpx; line-height: 1.5; }
.layout { display: block; }
.upload-column { min-width: 0; }
.panel { display: block; margin-bottom: 20rpx; }
.source-actions { display: flex; gap: 16rpx; margin: 12rpx 0 18rpx; }
.file { display: flex; align-items: center; gap: 16rpx; margin: 16rpx 0; overflow-wrap: anywhere; }
.primary { margin-top: 12rpx; }
.list-heading { display: flex; justify-content: flex-end; margin-bottom: 8rpx; }
.list-note { display: block; margin: 12rpx 0; color: #777; font-size: 22rpx; line-height: 1.5; }
.list-item { padding: 18rpx 0; border-top: 1rpx solid #eee; }
.list-name { display: block; overflow-wrap: anywhere; }
.list-actions { display: flex; gap: 12rpx; margin-top: 12rpx; }
.error { display: block; margin-top: 18rpx; color: #bd3b32; font-size: 23rpx; }
.result { display: block; margin-top: 18rpx; overflow-wrap: anywhere; white-space: pre-wrap; font-family: monospace; font-size: 21rpx; }
</style>

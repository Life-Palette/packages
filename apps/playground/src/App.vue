<script setup lang="ts">
import { analyzeMedia, type MediaAnalysisResult } from "@life-palette/media";
import {
  createOssUploader,
  createUploaderV2,
  type OSSFile,
  type UploadV2File,
} from "@life-palette/uploader";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const authTokenStorageKey = "life-palette.playground.auth-token";
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const selectedFiles = ref<File[]>([]);
const previewUrl = ref("");
const analysis = ref<MediaAnalysisResult | null>(null);
const errorMessage = ref("");
const isDragging = ref(false);
const isAnalyzing = ref(false);
const activeStage = ref<"idle" | "md5" | "decode" | "analyze" | "done">("idle");
const progress = ref(0);
const apiBaseUrl = ref("http://localhost:9527/api/v1");
const authToken = ref(localStorage.getItem(authTokenStorageKey) ?? "");
const isPrivate = ref(false);
const processMetadata = ref(true);
const isUploading = ref(false);
const uploadProgress = ref(0);
const uploadStage = ref("");
const uploadVersion = ref<"v1" | "v2">("v2");
const uploadResult = ref<Array<OSSFile | UploadV2File> | null>(null);
const uploadError = ref("");
interface PlaygroundFile {
  uid: string;
  name: string;
  type: string;
  file_md5: string;
  url: string;
  size: number;
  is_private: boolean;
  created_at: string;
}
const fileList = ref<PlaygroundFile[]>([]);
const isLoadingFiles = ref(false);
const deletingFileUID = ref("");
const fileListError = ref("");

watch(authToken, (token) => {
  if (token) {
    localStorage.setItem(authTokenStorageKey, token);
  } else {
    localStorage.removeItem(authTokenStorageKey);
  }
});

const isImage = computed(
  () => selectedFile.value?.type.startsWith("image/") ?? false
);
const isVideo = computed(
  () => selectedFile.value?.type.startsWith("video/") ?? false
);
const fileSize = computed(() => {
  const size = selectedFile.value?.size ?? 0;
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
});
const prettyJson = computed(() =>
  analysis.value ? JSON.stringify(analysis.value, null, 2) : ""
);
const objectSize = (value: unknown) =>
  value && typeof value === "object" ? Object.keys(value).length : 0;

const apiRequest = async <T>(path: string, init: RequestInit = {}) => {
  const token = authToken.value.replace(/^Bearer\s+/i, "").trim();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${apiBaseUrl.value.replace(/\/$/, "")}${path}`, {
    ...init,
    headers,
  });
  const body = (await response.json().catch(() => null)) as
    | { data?: T; message?: string }
    | null;
  if (!response.ok) {
    throw new Error(body?.message || `请求失败（${response.status}）`);
  }
  return body?.data as T;
};

const loadFiles = async () => {
  isLoadingFiles.value = true;
  fileListError.value = "";
  try {
    const page = await apiRequest<{ list: PlaygroundFile[] }>(
      "/files?page=1&page_size=100&sort=created_at,desc"
    );
    fileList.value = page?.list ?? [];
  } catch (error) {
    fileListError.value = error instanceof Error ? error.message : "文件列表加载失败";
  } finally {
    isLoadingFiles.value = false;
  }
};

const deleteFile = async (file: PlaygroundFile) => {
  if (deletingFileUID.value || !window.confirm(`确定删除文件“${file.name}”吗？`)) {
    return;
  }
  deletingFileUID.value = file.uid;
  fileListError.value = "";
  try {
    await apiRequest(`/files/${encodeURIComponent(file.uid)}`, { method: "DELETE" });
    fileList.value = fileList.value.filter((item) => item.uid !== file.uid);
  } catch (error) {
    fileListError.value = error instanceof Error ? error.message : "文件删除失败";
  } finally {
    deletingFileUID.value = "";
  }
};

const openPicker = () => fileInput.value?.click();
const clearPreview = () => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
  }
  previewUrl.value = "";
};
const setFiles = (files: File[]) => {
  const file = files[0];
  if (!file) {
    return;
  }
  errorMessage.value = "";
  analysis.value = null;
  progress.value = 0;
  activeStage.value = "idle";
  clearPreview();
  selectedFiles.value = files;
  selectedFile.value = file;
  previewUrl.value = URL.createObjectURL(file);
};
const handleInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  setFiles(Array.from(input.files ?? []));
  input.value = "";
};
const handleDrop = (event: DragEvent) => {
  isDragging.value = false;
  setFiles(Array.from(event.dataTransfer?.files ?? []));
};
const runAnalysis = async () => {
  if (!selectedFile.value || isAnalyzing.value) {
    return;
  }
  isAnalyzing.value = true;
  errorMessage.value = "";
  analysis.value = null;
  try {
    analysis.value = await analyzeMedia(selectedFile.value, {
      colorCount: 5,
      includeRawExif: true,
      onProgress: ({ stage, percent }) => {
        activeStage.value = stage;
        progress.value = percent;
      },
    });
    activeStage.value = "done";
    progress.value = 100;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "文件分析失败";
    activeStage.value = "idle";
  } finally {
    isAnalyzing.value = false;
  }
};
const runUpload = async () => {
  const files = selectedFiles.value.length
    ? selectedFiles.value
    : selectedFile.value
      ? [selectedFile.value]
      : [];
  if (files.length === 0 || isUploading.value) {
    return;
  }
  isUploading.value = true;
  uploadProgress.value = 0;
  uploadStage.value = "分析文件";
  uploadResult.value = null;
  uploadError.value = "";
  analysis.value = null;
  const token = authToken.value.replace(/^Bearer\s+/i, "").trim();
  try {
    if (uploadVersion.value === "v2") {
      const uploader = createUploaderV2({
        apiBaseUrl: apiBaseUrl.value.replace(/\/$/, ""),
        getToken: () => token || null,
      });
      const results: UploadV2File[] = [];
      for (const [index, file] of files.entries()) {
        let metadata: MediaAnalysisResult | undefined;
        if (processMetadata.value) {
          uploadStage.value = `处理元信息 ${index + 1}/${files.length}`;
          metadata = await analyzeMedia(file, {
            colorCount: 5,
            includeRawExif: true,
            onProgress: ({ stage, percent }) => {
              uploadStage.value = `元信息：${stage}`;
              uploadProgress.value = Math.round(
                ((index + percent / 100) / files.length) * 100
              );
            },
          });
        }
        uploadStage.value = `V2 上传 ${index + 1}/${files.length}`;
        results.push(
          await uploader.upload(file, {
            checksum: metadata?.basic.md5,
            metadata,
            isPrivate: isPrivate.value,
            onProgress: ({ stage, percent }) => {
              uploadStage.value = `V2 ${stage}`;
              uploadProgress.value = Math.round(
                ((index + percent / 100) / files.length) * 100
              );
            },
          })
        );
      }
      uploadResult.value = results;
      uploadStage.value = "V2 上传完成";
      uploadProgress.value = 100;
      return;
    }

    const uploader = createOssUploader({
      apiBaseUrl: apiBaseUrl.value.replace(/\/$/, ""),
      getToken: () => token || null,
    });
    if (files.length === 1) {
      const currentAnalysis = processMetadata.value
        ? await analyzeMedia(files[0], {
            colorCount: 5,
            includeRawExif: true,
            onProgress: ({ stage, percent }) => {
              uploadProgress.value = percent;
              uploadStage.value = `分析：${stage}`;
            },
          })
        : undefined;
      analysis.value = currentAnalysis ?? null;
      uploadResult.value = [
        await uploader.upload(files[0], {
          analyze: processMetadata.value,
          isPrivate: isPrivate.value,
          onProgress: ({ stage, percent }) => {
            uploadStage.value = stage;
            uploadProgress.value = percent;
          },
          precomputedAnalysis: currentAnalysis,
        }),
      ];
    } else {
      uploadResult.value = await uploader.uploadBatch(files, {
        analyze: processMetadata.value,
        analysis: { colorCount: 5, includeRawExif: true },
        isPrivate: isPrivate.value,
        onProgress: ({ stage, percent }) => {
          uploadStage.value = stage;
          uploadProgress.value = percent;
        },
      });
    }
    uploadStage.value = "上传完成";
    uploadProgress.value = 100;
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : "上传失败";
    uploadStage.value = "上传失败";
  } finally {
    isUploading.value = false;
    await loadFiles();
  }
};
const reset = () => {
  clearPreview();
  selectedFile.value = null;
  selectedFiles.value = [];
  analysis.value = null;
  errorMessage.value = "";
  progress.value = 0;
  activeStage.value = "idle";
  uploadResult.value = null;
  uploadError.value = "";
  uploadProgress.value = 0;
  uploadStage.value = "";
};
onMounted(loadFiles);
onBeforeUnmount(clearPreview);
</script>

<template>
  <main class="app">
    <header class="header">
      <h1>媒体文件分析</h1>
      <span class="header-note">点击上传后自动完成分析、OSS 上传和服务端入库</span>
    </header>

    <section
      class="drop-zone"
      :class="{ dragging: isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
      @click="openPicker"
    >
      <input ref="fileInput" type="file" accept="image/*,video/*" multiple hidden @change="handleInput" />
      <p class="drop-title">拖入图片或视频，或点击选择文件</p>
      <p class="drop-hint">支持 JPG / PNG / WEBP / GIF / MP4 / MOV</p>
    </section>

    <section v-if="selectedFile" class="file-bar">
      <span class="file-name">{{ selectedFile.name }}<template v-if="selectedFiles.length > 1"> 等 {{ selectedFiles.length }} 个文件</template></span>
      <span class="file-meta">{{ selectedFile.type || "unknown" }} · {{ fileSize }}</span>
      <button class="btn btn-text" type="button" @click.stop="reset">移除</button>
    </section>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <section class="panel upload-panel">
      <h2 class="panel-title">测试上传</h2>
      <p class="panel-note">
        V2 对接当前 Go 统一上传接口；V1 保留旧 OSS Policy 上传流程和媒体分析流程。Token 会保存在当前浏览器。
      </p>
      <label class="field">
        <span>API 地址</span>
        <input v-model="apiBaseUrl" type="url" placeholder="http://localhost:9527/api/v1" />
      </label>
      <label class="field">
        <span>鉴权 Token</span>
        <input v-model="authToken" type="password" placeholder="Bearer ... 或纯 token" />
      </label>
      <label class="field">
        <span>上传版本</span>
        <select v-model="uploadVersion">
          <option value="v2">V2 · Go 统一 S3 上传</option>
          <option value="v1">V1 · 旧 OSS 上传</option>
        </select>
      </label>
      <label class="check-field">
        <input v-model="isPrivate" type="checkbox" />
        <span>设为私有文件</span>
      </label>
      <label class="check-field">
        <input v-model="processMetadata" type="checkbox" />
        <span>处理媒体元信息（EXIF、尺寸、颜色、视频信息）</span>
      </label>
      <div class="upload-action">
        <button class="btn btn-primary" type="button" :disabled="isUploading || !selectedFile" @click="runUpload">
          {{ isUploading ? "处理中 " + uploadProgress + "%" : "上传" }}
        </button>
        <span class="stage-text">{{ uploadStage || "等待上传" }}</span>
      </div>
      <div v-if="isUploading || uploadResult" class="progress">
        <span :style="{ width: uploadProgress + '%' }"></span>
      </div>
      <p v-if="uploadError" class="error">{{ uploadError }}</p>
      <pre v-if="uploadResult" class="json upload-result">{{ JSON.stringify(uploadResult, null, 2) }}</pre>
    </section>

    <section v-if="selectedFile" class="action-bar">
      <button class="btn btn-secondary" type="button" :disabled="isAnalyzing || isUploading" @click="runAnalysis">
        {{ isAnalyzing ? `分析中 ${progress}%` : analysis ? "重新分析" : "仅分析" }}
      </button>
      <div class="progress"><span :style="{ width: `${progress}%` }"></span></div>
      <span class="stage-text">{{ activeStage === "done" ? "分析完成" : isAnalyzing ? activeStage : "可单独分析" }}</span>
    </section>

    <section class="panel file-list-panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">文件列表</h2>
          <p class="panel-note">显示当前 API 地址下的文件；删除需要有效 Token。</p>
        </div>
        <button class="btn btn-secondary" type="button" :disabled="isLoadingFiles" @click="loadFiles">
          {{ isLoadingFiles ? "刷新中" : "刷新列表" }}
        </button>
      </div>
      <p v-if="fileListError" class="error">{{ fileListError }}</p>
      <p v-else-if="!isLoadingFiles && fileList.length === 0" class="empty-state">暂无文件</p>
      <div v-else class="file-list">
        <div v-for="file in fileList" :key="file.uid" class="file-list-item">
          <div class="file-list-main">
            <a v-if="file.url" :href="file.url" target="_blank" rel="noreferrer">{{ file.name }}</a>
            <span v-else>{{ file.name }}</span>
            <small>{{ file.type }} · {{ file.size }} B · {{ file.is_private ? "私有" : "公开" }}</small>
          </div>
          <button class="btn btn-danger" type="button" :disabled="deletingFileUID === file.uid" @click="deleteFile(file)">
            {{ deletingFileUID === file.uid ? "删除中" : "删除" }}
          </button>
        </div>
      </div>
    </section>

    <template v-if="analysis">
      <div class="grid">
        <section class="panel">
          <h2 class="panel-title">预览</h2>
          <div class="preview">
            <img v-if="isImage" :src="previewUrl" :alt="selectedFile?.name" />
            <video v-else-if="isVideo" :src="previewUrl" controls muted></video>
          </div>
        </section>

        <section class="panel">
          <h2 class="panel-title">基本信息</h2>
          <dl class="kv">
            <div><dt>MD5</dt><dd class="mono break">{{ analysis.basic.md5 }}</dd></div>
            <div><dt>类型</dt><dd>{{ analysis.basic.type }}</dd></div>
            <div><dt>大小</dt><dd>{{ fileSize }}</dd></div>
            <div><dt>尺寸</dt><dd>{{ analysis.basic.width }} × {{ analysis.basic.height }} px</dd></div>
            <div v-if="analysis.video?.duration"><dt>时长</dt><dd>{{ analysis.video.duration.toFixed(2) }} s</dd></div>
          </dl>
        </section>
      </div>

      <section v-if="analysis.image" class="panel">
        <h2 class="panel-title">特征值</h2>
        <dl class="kv">
          <div><dt>ArtHash（{{ analysis.image.arthash_codec }}）</dt><dd class="mono break">{{ analysis.image.arthash }}</dd></div>
          <div><dt>BlurHash</dt><dd class="mono break">{{ analysis.image.blurhash }}</dd></div>
        </dl>
      </section>

      <section v-if="analysis.image" class="panel">
        <h2 class="panel-title">主色（{{ analysis.image.colors.length }}）</h2>
        <ul class="colors">
          <li v-for="color in analysis.image.colors" :key="color.hex">
            <span class="swatch" :style="{ backgroundColor: color.hex }"></span>
            <span class="mono color-hex">{{ color.hex }}</span>
            <span class="bar"><i :style="{ width: `${color.percentage}%`, backgroundColor: color.hex }"></i></span>
            <span class="mono color-pct">{{ color.percentage.toFixed(1) }}%</span>
          </li>
        </ul>
      </section>

      <section v-if="analysis.image?.exif" class="panel">
        <h2 class="panel-title">EXIF（{{ objectSize(analysis.image.exif) }} 项）</h2>
        <dl class="kv scroll">
          <div v-for="(value, key) in analysis.image.exif" :key="key"><dt>{{ key }}</dt><dd class="break">{{ value }}</dd></div>
        </dl>
      </section>

      <section class="panel">
        <h2 class="panel-title">JSON</h2>
        <pre class="json">{{ prettyJson }}</pre>
      </section>

    </template>
  </main>
</template>

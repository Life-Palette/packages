<script lang="ts">
import { defineComponent } from "vue";
import type { MediaAnalysisResult } from "@life-palette/uploader-uniapp";
import { analyzeMedia } from "../../utils/upload-workflow";
import { runMetaprobeChecks, type ValidationReport } from "../../utils/metaprobe";

export default defineComponent({
  data() {
    return {
      busy: false,
      status: "等待选择文件",
      error: "",
      progress: 0,
      report: null as ValidationReport | null,
      result: null as MediaAnalysisResult | null,
      expandedSections: [] as string[],
    };
  },
  computed: {
    passedChecks(): number {
      return this.report?.checks.filter((item) => item.passed).length ?? 0;
    },
    failedChecks(): number {
      return this.report?.checks.filter((item) => !item.passed).length ?? 0;
    },
    formattedResult(): string {
      return this.result ? JSON.stringify(this.result, null, 2) : "";
    },
  },
  methods: {
    async runValidation() {
      this.busy = true;
      this.error = "";
      this.status = "正在运行解析器自检";
      try {
        const report = await runMetaprobeChecks();
        this.report = report;
        this.status = report.status === "passed" ? "解析器自检通过" : "部分检查未通过";
        if (report.error) this.error = report.error;
        return report;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        this.status = "自检失败";
        return null;
      } finally {
        this.busy = false;
      }
    },
    chooseFile() {
      this.error = "";
      uni.chooseMedia({
        count: 1,
        mediaType: ["image", "video"],
        sizeType: ["original"],
        sourceType: ["album"],
        success: async ({ tempFiles }) => {
          const file = tempFiles[0];
          console.info("[metaprobe] chooseMedia success", {
            count: tempFiles.length,
            files: tempFiles.map(({ fileType, size }) => ({ fileType, size })),
          });
          if (file) {
            const name = file.tempFilePath.split("/").pop() || `media.${file.fileType}`;
            await this.analyzeFile(file.tempFilePath, name);
          }
        },
        fail: (reason) => {
          console.error("[metaprobe] chooseMedia failed", reason.errMsg);
          this.error = reason.errMsg || "无法打开文件选择器，请重试";
          this.status = "未选择文件";
        },
      });
    },
    async analyzeFile(path: string, name: string, visualAnalysis = true) {
      this.busy = true;
      this.error = "";
      this.progress = 0;
      this.status = "正在读取文件";
      this.report = null;
      this.result = null;
      try {
        const metadata = await analyzeMedia(
          { path, name },
          { platform: "mp" },
          {
            includeRawExif: true,
            visualAnalysis,
            onProgress: ({ stage, percent }) => {
              this.progress = percent;
              this.status = this.progressLabel(stage);
            },
          }
        );
        this.result = metadata;
        this.status = "文件解析完成";
        return metadata;
      } catch (reason) {
        console.error("[metaprobe] analyzeMedia failed", {
          name: reason instanceof Error ? reason.name : "UnknownError",
          message: reason instanceof Error ? reason.message : String(reason),
        });
        this.error = reason instanceof Error ? reason.message : String(reason);
        this.status = "解析失败";
        return null;
      } finally {
        this.busy = false;
      }
    },
    progressLabel(stage: string) {
      const labels: Record<string, string> = {
        md5: "计算文件校验值",
        decode: "读取图像像素",
        analyze: "整理媒体信息",
      };
      return labels[stage] ?? "正在解析文件";
    },
    formatSize(bytes: number) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    },
    copyText(value: string | undefined, label: string) {
      if (!value) return;
      uni.setClipboardData({
        data: value,
        success: () => {
          this.status = `${label}已复制`;
        },
        fail: () => {
          this.error = `复制${label}失败，请长按内容选择`;
        },
      });
    },
  },
});
</script>

<template>
  <view class="inspector-page">
    <view class="page-header">
      <view class="page-title-row">
        <text class="page-title">媒体文件解析</text>
        <wd-tag type="success" variant="light" size="small">本地处理</wd-tag>
      </view>
      <text class="page-subtitle">查看图片与视频的元数据、EXIF 和图像特征</text>
    </view>

    <wd-card title="选择文件" custom-class="surface-card action-card">
      <wd-button type="primary" block size="large" round :loading="busy" :disabled="busy" @click="chooseFile">
        {{ busy ? "正在处理" : "选择图片或视频" }}
      </wd-button>
      <view class="secondary-action">
        <wd-button variant="plain" block round :disabled="busy" @click="runValidation">运行解析器自检</wd-button>
      </view>
      <view v-if="busy" class="progress-area">
        <view class="progress-caption"><text>{{ status }}</text><text>{{ progress }}%</text></view>
        <wd-progress :percentage="progress" :hide-text="true" />
      </view>
      <view v-else class="status-line">
        <view class="status-indicator" :class="{ 'status-indicator--error': error, 'status-indicator--success': result || report?.status === 'passed' }" />
        <text>{{ status }}</text>
      </view>
      <view v-if="error" class="error-message">
        <text class="error-title">处理未完成</text>
        <text>{{ error }}</text>
        <text class="error-hint">请检查文件是否有效，然后重新选择。</text>
      </view>
    </wd-card>

    <wd-card v-if="report" title="解析器自检" custom-class="surface-card section-card">
      <view class="check-summary">
        <view class="check-count">
          <text class="check-count-value">{{ passedChecks }}</text>
          <text class="check-count-label">项检查通过</text>
        </view>
        <wd-tag :type="failedChecks ? 'warning' : 'success'" variant="light">
          {{ failedChecks ? `${failedChecks} 项需关注` : "全部通过" }}
        </wd-tag>
      </view>
      <text class="environment-note">微信开发者工具 · {{ report.environment.SDKVersion }} · {{ report.environment.system }}</text>
      <wd-collapse v-model="expandedSections" custom-class="detail-collapse">
        <wd-collapse-item :title="`查看全部 ${report.checks.length} 项检查`" name="checks">
          <view class="check-list">
            <view v-for="check in report.checks" :key="check.name" class="check-item">
              <view class="check-copy"><text class="check-name">{{ check.name }}</text><text v-if="check.detail" class="check-detail">{{ check.detail }}</text></view>
              <wd-tag :type="check.passed ? 'success' : 'danger'" variant="light" size="small">{{ check.passed ? "通过" : "失败" }}</wd-tag>
            </view>
          </view>
        </wd-collapse-item>
      </wd-collapse>
    </wd-card>

    <view v-if="result" class="results">
      <view class="results-heading">
        <view>
          <text class="section-heading">解析结果</text>
        </view>
        <wd-tag type="success" variant="light">已完成</wd-tag>
      </view>

      <wd-card title="文件概览" custom-class="surface-card section-card">
        <wd-cell-group border>
          <wd-cell title="文件名" :value="result.basic.name" />
          <wd-cell title="媒体类型" :value="result.basic.type" />
          <wd-cell title="文件大小" :value="formatSize(result.basic.size)" />
          <wd-cell v-if="result.basic.width && result.basic.height" title="图像尺寸" :value="`${result.basic.width} × ${result.basic.height}`" />
          <wd-cell title="解析版本" :value="`v${result.schema_version}`" />
        </wd-cell-group>
        <view class="checksum-row">
          <text class="checksum-label">MD5</text>
          <text class="checksum-value" selectable>{{ result.basic.md5 }}</text>
        </view>
      </wd-card>

      <wd-card v-if="result.image" title="图像摘要" custom-class="surface-card section-card">
        <view class="hash-panel blurhash-panel">
          <view class="hash-heading"><text class="field-label">BlurHash</text><wd-button size="mini" variant="text" round :disabled="!result.image.blurhash" @click="copyText(result.image.blurhash, 'BlurHash')">复制</wd-button></view>
          <text v-if="result.image.blurhash" class="hash-value" selectable>{{ result.image.blurhash }}</text>
          <text v-else class="muted-value">未生成图像摘要</text>
        </view>
        <view class="palette-block">
          <view class="palette-heading"><text class="field-label">提取主色</text><text class="palette-caption">{{ result.image.colors.length }} 色</text></view>
          <view v-if="result.image.colors.length" class="palette-list">
            <view v-for="color in result.image.colors" :key="color.rank" class="palette-item">
              <view class="palette-swatch" :style="{ backgroundColor: color.hex }" />
              <view class="palette-info"><text class="palette-hex">{{ color.hex }}</text><text class="palette-percent">{{ color.percentage.toFixed(1) }}%</text></view>
            </view>
          </view>
          <wd-empty v-else tip="没有提取到明显主色" />
        </view>
        <wd-collapse v-if="result.image.arthash" v-model="expandedSections" custom-class="detail-collapse">
          <wd-collapse-item title="ArtHash 编码" name="arthash">
            <view class="hash-heading"><wd-tag type="primary" variant="light" size="small">{{ result.image.arthash_codec }}</wd-tag><wd-button size="mini" variant="text" round @click="copyText(result.image?.arthash, 'ArtHash')">复制</wd-button></view>
            <text class="hash-value hash-value--long" selectable>{{ result.image.arthash }}</text>
          </wd-collapse-item>
        </wd-collapse>
      </wd-card>

      <wd-card v-if="result.image && Object.keys(result.image.exif).length" title="拍摄信息" custom-class="surface-card section-card">
        <wd-cell-group border>
          <wd-cell v-if="result.image.exif.device_make || result.image.exif.device_model" title="相机" :value="[result.image.exif.device_make, result.image.exif.device_model].filter(Boolean).join(' ')" />
          <wd-cell v-if="result.image.exif.taken_at" title="拍摄时间" :value="result.image.exif.taken_at" />
          <wd-cell v-if="result.image.exif.lens_model" title="镜头" :value="result.image.exif.lens_model" />
          <wd-cell v-if="result.image.exif.iso" title="ISO" :value="String(result.image.exif.iso)" />
          <wd-cell v-if="result.image.exif.focal_length" title="焦距" :value="`${result.image.exif.focal_length} mm`" />
          <wd-cell v-if="result.image.exif.f_number" title="光圈" :value="`f/${result.image.exif.f_number}`" />
          <wd-cell v-if="result.image.exif.exposure_time" title="曝光时间" :value="result.image.exif.exposure_time" />
        </wd-cell-group>
        <wd-collapse v-if="result.image.exif.raw && Object.keys(result.image.exif.raw).length" v-model="expandedSections" custom-class="detail-collapse">
          <wd-collapse-item title="查看全部 EXIF 字段" name="exif">
            <text class="raw-metadata" selectable>{{ JSON.stringify(result.image.exif.raw, null, 2) }}</text>
          </wd-collapse-item>
        </wd-collapse>
      </wd-card>

      <wd-card v-if="result.video" title="视频信息" custom-class="surface-card section-card">
        <text class="raw-metadata" selectable>{{ JSON.stringify(result.video, null, 2) }}</text>
      </wd-card>

      <wd-collapse v-model="expandedSections" custom-class="full-result-collapse">
        <wd-collapse-item title="查看完整解析数据" name="full-result">
          <text class="raw-metadata" selectable>{{ formattedResult }}</text>
        </wd-collapse-item>
      </wd-collapse>
    </view>

    <wd-card v-else-if="!report" custom-class="surface-card empty-card">
      <wd-empty tip="选择一份本地媒体文件，结果会显示在这里" />
    </wd-card>

    <text class="footer-note">metaprobe · 本地媒体解析</text>
  </view>
</template>

<style>
.inspector-page { min-height: 100vh; box-sizing: border-box; padding: 28rpx 28rpx calc(36rpx + env(safe-area-inset-bottom)); color: #242833; background: #f5f7fa; }
.page-header { padding: 8rpx 4rpx 24rpx; }
.page-title-row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.page-title { color: #20242c; font-size: 38rpx; font-weight: 600; }
.page-subtitle { display: block; margin-top: 8rpx; color: #747b87; font-size: 23rpx; line-height: 1.5; }
.surface-card { display: block; margin-bottom: 18rpx; }
.secondary-action { margin-top: 10rpx; }
.progress-area { margin-top: 20rpx; }
.progress-caption { display: flex; justify-content: space-between; margin-bottom: 10rpx; color: #66707e; font-size: 22rpx; }
.status-line { display: flex; align-items: center; gap: 10rpx; margin-top: 16rpx; color: #747b87; font-size: 22rpx; }
.status-indicator { width: 12rpx; height: 12rpx; border-radius: 50%; background: #9ca3af; }
.status-indicator--success { background: #12b886; }
.status-indicator--error { background: #e5484d; }
.error-message { display: flex; flex-direction: column; gap: 8rpx; margin-top: 18rpx; padding: 16rpx; border-radius: 12rpx; color: #9f3034; background: #fff1f0; font-size: 22rpx; line-height: 1.5; }
.error-title { font-weight: 600; }
.error-hint { color: #a45b5e; }
.check-summary { display: flex; align-items: center; justify-content: space-between; padding: 2rpx 0 14rpx; }
.check-count { display: flex; align-items: baseline; gap: 10rpx; }
.check-count-value { color: #12a875; font-size: 40rpx; font-weight: 650; font-variant-numeric: tabular-nums; }
.check-count-label { color: #727987; font-size: 22rpx; }
.environment-note { display: block; margin-bottom: 10rpx; color: #858b95; font-size: 20rpx; }
.check-item { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; padding: 13rpx 0; border-bottom: 1rpx solid #edf0f3; }
.check-item:last-child { border-bottom: 0; }
.check-copy { flex: 1; min-width: 0; }
.check-name { display: block; color: #444b55; font-size: 22rpx; line-height: 1.45; }
.check-detail { display: block; margin-top: 5rpx; color: #7e8590; font-size: 20rpx; overflow-wrap: anywhere; }
.results-heading { display: flex; align-items: center; justify-content: space-between; margin: 28rpx 4rpx 14rpx; }
.section-heading { color: #20242c; font-size: 34rpx; font-weight: 600; }
.checksum-row { display: flex; flex-direction: column; gap: 6rpx; padding: 14rpx 30rpx 4rpx; }
.checksum-label { color: #858b95; font-size: 19rpx; letter-spacing: 1rpx; }
.checksum-value { color: #4d5560; font-family: monospace; font-size: 20rpx; overflow-wrap: anywhere; }
.hash-heading, .palette-heading { display: flex; align-items: center; justify-content: space-between; gap: 14rpx; }
.field-label { color: #525b68; font-size: 23rpx; font-weight: 600; }
.hash-value { display: block; margin-top: 8rpx; padding: 12rpx; border-radius: 8rpx; color: #343a43; background: #f4f6f8; font-family: monospace; font-size: 22rpx; line-height: 1.5; overflow-wrap: anywhere; word-break: break-all; }
.muted-value { display: block; margin-top: 8rpx; color: #858b95; font-size: 21rpx; }
.palette-block { margin-top: 22rpx; }
.palette-caption { color: #858b95; font-size: 20rpx; }
.palette-list { display: flex; flex-direction: column; gap: 12rpx; margin-top: 14rpx; }
.palette-item { display: flex; align-items: center; gap: 12rpx; }
.palette-swatch { width: 40rpx; height: 40rpx; flex: none; border: 1rpx solid #e5e7eb; border-radius: 7rpx; }
.palette-info { display: flex; flex: 1; align-items: center; justify-content: space-between; }
.palette-hex { color: #424953; font-family: monospace; font-size: 22rpx; }
.palette-percent { color: #7d8490; font-size: 20rpx; font-variant-numeric: tabular-nums; }
.detail-collapse { margin-top: 12rpx; }
.hash-value--long { max-height: 300rpx; overflow-y: auto; }
.raw-metadata { display: block; max-height: 600rpx; overflow-y: auto; padding: 14rpx; border-radius: 8rpx; color: #424953; background: #f4f6f8; font-family: monospace; font-size: 19rpx; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-all; }
.full-result-collapse { margin-bottom: 20rpx; }
.empty-card { margin-top: 12rpx; }
.footer-note { display: block; margin: 14rpx 0; color: #959ba4; font-size: 19rpx; text-align: center; }
</style>

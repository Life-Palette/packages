<script lang="ts">
import { defineComponent } from "vue";
import { analyzeLocalFile, runMetaprobeChecks } from "../../utils/metaprobe";

export default defineComponent({
  data() {
    return { busy: false, status: "尚未运行", report: "", result: "" };
  },
  methods: {
    async runValidation() {
      this.busy = true;
      this.status = "验证中";
      try {
        const report = await runMetaprobeChecks();
        this.report = JSON.stringify(report, null, 2);
        this.status = report.status === "passed" ? "验证通过" : "验证失败";
        return report;
      } finally {
        this.busy = false;
      }
    },
    chooseFile() {
      uni.chooseMessageFile({
        count: 1,
        type: "all",
        success: async ({ tempFiles }) => {
          const file = tempFiles[0];
          if (!file) return;
          await this.analyzeFile(file.path, file.name);
        },
        fail: (error) => { this.result = error.errMsg; },
      });
    },
    async analyzeFile(path: string, name: string) {
      this.busy = true;
      this.report = "";
      this.result = "";
      try {
        const metadata = await analyzeLocalFile(path, name, (status) => {
          this.status = status;
        });
        this.result = JSON.stringify(metadata, null, 2);
        this.status = "文件解析完成";
        return metadata;
      } catch (error) {
        this.result = error instanceof Error ? error.message : String(error);
        this.status = "文件解析失败";
        return null;
      } finally {
        this.busy = false;
      }
    },
    openUploader() {
      uni.navigateTo({ url: "/pages/index/index" });
    },
  },
});
</script>

<template>
  <view class="validation-page">
    <text class="validation-title">metaprobe 小程序验证</text>
    <text class="validation-note">本地解析，不上传文件。覆盖 WASM、图片尺寸、EXIF、视频时长、哈希和错误处理。</text>
    <button :disabled="busy" @click="runValidation">运行内置验证</button>
    <text class="validation-status">{{ status }}</text>
    <text v-if="report" class="validation-output" selectable>{{ report }}</text>
    <button :disabled="busy" @click="chooseFile">选择聊天文件解析（图片 / 视频）</button>
    <text v-if="result" class="validation-output" selectable>{{ result }}</text>
    <button :disabled="busy" @click="openUploader">打开上传 Demo</button>
  </view>
</template>

<style>
.validation-page { padding: 32rpx; }
.validation-title { display: block; font-size: 40rpx; font-weight: 600; margin-bottom: 16rpx; }
.validation-note { display: block; color: #617269; margin-bottom: 24rpx; line-height: 1.6; }
.validation-status { display: block; margin: 24rpx 0; }
.validation-output { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font-family: monospace; font-size: 24rpx; margin: 24rpx 0; }
</style>

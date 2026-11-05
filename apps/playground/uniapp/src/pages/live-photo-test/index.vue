<script lang="ts">
import {
  createTemporaryFile,
  openUploadFile,
  type TemporaryFile,
} from "@life-palette/uploader/uniapp";
import { defineComponent } from "vue";
import {
  inspectLivePhotoBytes as inspectLivePhoto,
  type LivePhotoForensics,
} from "../../utils/live-photo-forensics";
import { analyzeMedia } from "../../utils/upload-workflow";

interface PickedPhoto {
  fields: string[];
  name: string;
  path: string;
  pickerByteSize?: number;
  pickerSize?: number;
}

export default defineComponent({
  beforeUnmount() {
    this.releaseExtractedVideo();
  },
  data() {
    return {
      busy: false,
      error: "",
      extractedPhotoPath: "",
      extractedPhotoText: "",
      extractedVideoPath: "",
      extractedVideoText: "",
      forensics: null as LivePhotoForensics | null,
      forensicsText: "",
      metaprobeText: "",
      photo: null as PickedPhoto | null,
      photoTemp: null as TemporaryFile | null,
      status: "请选择 iPhone 相册中的实况照片原图",
      videoTemp: null as TemporaryFile | null,
    };
  },
  methods: {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Diagnostic UI reports each original media container and extraction step.
    async analyzePhoto() {
      if (!this.photo || this.busy) {
        return;
      }
      this.busy = true;
      this.error = "";
      this.status = "正在读取原始字节并检查容器结构";
      this.extractedVideoPath = "";
      this.extractedVideoText = "";
      this.extractedPhotoPath = "";
      this.extractedPhotoText = "";
      await this.releaseExtractedVideo();
      try {
        const photo = this.photo;
        const file = { name: photo.name, path: photo.path };
        const reader = await openUploadFile(file, { platform: "mp" });
        let forensic: LivePhotoForensics;
        try {
          const bytes = new Uint8Array(reader.size);
          for (let start = 0; start < reader.size; start += 1024 * 1024) {
            const end = Math.min(start + 1024 * 1024, reader.size);
            bytes.set(new Uint8Array(await reader.read(start, end)), start);
          }
          forensic = inspectLivePhoto(bytes);
        } finally {
          await reader.close();
        }
        this.forensics = forensic;
        const diagnostics: Record<string, unknown> = {
          extractedVideo: forensic.embeddedVideoSize
            ? {
                bytes: forensic.embeddedVideoSize,
                offset: forensic.embeddedVideoOffset,
              }
            : null,
          filesystem: {
            actualBytesRead: forensic.fileSize,
            actualSizeMiB: (forensic.fileSize / (1024 * 1024)).toFixed(3),
            bytesAfterJpegEoi: forensic.bytesAfterJpeg,
            embeddedSignatures: forensic.embeddedSignatures,
            exifDirectoryEntries: forensic.exifDirectoryEntries,
            first32BytesHex: forensic.headHex,
            jpegEoiOffset: forensic.jpegEoiOffset,
            jpegSegments: forensic.jpegSegments,
            last32BytesHex: forensic.tailHex,
            videoCandidates: forensic.videoCandidates,
          },
          livePhotoMarkersFound: forensic.markers,
          picker: {
            name: photo.name,
            path: photo.path,
            returnedByteSize: photo.pickerByteSize,
            returnedFields: photo.fields,
            returnedSize: photo.pickerSize,
          },
          videoContainerBoxes: forensic.videoBoxes,
        };
        this.forensicsText = JSON.stringify(diagnostics, null, 2);
        console.info(
          "[live-photo] raw file + container diagnostics",
          this.forensicsText
        );

        let stillMetadata: Awaited<ReturnType<typeof analyzeMedia>> | undefined;
        try {
          this.status = "原始字节扫描完成，正在调用 metaprobe 分析静态图";
          stillMetadata = await analyzeMedia(
            file,
            { platform: "mp" },
            {
              includeRawExif: true,
              visualAnalysis: false,
            }
          );
          this.metaprobeText = JSON.stringify(stillMetadata, null, 2);
          diagnostics.metaprobeStillImage = stillMetadata;
          console.info(
            "[live-photo] metaprobe still-image result",
            this.metaprobeText
          );
        } catch (reason) {
          const message =
            reason instanceof Error
              ? `${reason.name}: ${reason.message}`
              : String(reason);
          diagnostics.metaprobeStillImageError = message;
          this.metaprobeText = JSON.stringify({ error: message }, null, 2);
          console.error(
            "[live-photo] metaprobe still-image failed",
            JSON.stringify(
              {
                error: message,
                stack: reason instanceof Error ? reason.stack : undefined,
              },
              null,
              2
            )
          );
        }

        if (forensic.embeddedVideo) {
          this.status = "发现候选视频容器，正在尝试拆出并再次由 metaprobe 分析";
          if (forensic.embeddedPhoto) {
            this.photoTemp = await createTemporaryFile(forensic.embeddedPhoto, {
              platform: "mp",
            });
            this.extractedPhotoPath = this.photoTemp.file.path;
            diagnostics.extractedPhoto = {
              bytes: forensic.embeddedPhotoSize,
              offset: 0,
              path: this.extractedPhotoPath,
            };
            try {
              const photoMetadata = await analyzeMedia(
                {
                  name: "live-photo-extracted.jpg",
                  path: this.extractedPhotoPath,
                },
                { platform: "mp" },
                { includeRawExif: true, visualAnalysis: false }
              );
              this.extractedPhotoText = JSON.stringify(photoMetadata, null, 2);
              diagnostics.metaprobeExtractedPhoto = photoMetadata;
              console.info(
                "[live-photo] metaprobe extracted-photo result",
                this.extractedPhotoText
              );
            } catch (reason) {
              const message =
                reason instanceof Error
                  ? `${reason.name}: ${reason.message}`
                  : String(reason);
              this.extractedPhotoText = JSON.stringify(
                { error: message },
                null,
                2
              );
              diagnostics.metaprobeExtractedPhotoError = message;
              console.error(
                "[live-photo] metaprobe extracted-photo failed",
                JSON.stringify(
                  {
                    error: message,
                    stack: reason instanceof Error ? reason.stack : undefined,
                  },
                  null,
                  2
                )
              );
            }
          }
          this.videoTemp = await createTemporaryFile(forensic.embeddedVideo, {
            platform: "mp",
          });
          this.extractedVideoPath = this.videoTemp.file.path;
          diagnostics.extractedVideo = {
            bytes: forensic.embeddedVideoSize,
            offset: forensic.embeddedVideoOffset,
            path: this.extractedVideoPath,
          };
          try {
            const videoMetadata = await analyzeMedia(
              {
                name: "live-photo-extracted.mov",
                path: this.extractedVideoPath,
              },
              { platform: "mp" },
              { includeRawExif: true, visualAnalysis: false }
            );
            this.extractedVideoText = JSON.stringify(videoMetadata, null, 2);
            diagnostics.metaprobeExtractedVideo = videoMetadata;
            this.status = "候选视频已拆出，metaprobe 已识别其媒体信息";
            console.info(
              "[live-photo] metaprobe extracted-video result",
              this.extractedVideoText
            );
          } catch (reason) {
            const message =
              reason instanceof Error
                ? `${reason.name}: ${reason.message}`
                : String(reason);
            this.extractedVideoText = JSON.stringify(
              { error: message },
              null,
              2
            );
            diagnostics.metaprobeExtractedVideoError = message;
            this.status =
              "发现视频容器并已拆出，但 metaprobe 无法解析该候选文件";
            console.error(
              "[live-photo] metaprobe extracted-video failed",
              JSON.stringify(
                {
                  error: message,
                  stack: reason instanceof Error ? reason.stack : undefined,
                },
                null,
                2
              )
            );
          }
        } else {
          this.status = stillMetadata
            ? "metaprobe 分析完成；所选文件中没有找到可验证的视频容器"
            : "原始字节扫描完成，静态图 metaprobe 解析失败；未发现可验证的视频容器";
        }

        this.forensicsText = JSON.stringify(diagnostics, null, 2);
        console.info(
          "[live-photo] complete analysis report",
          this.forensicsText
        );
      } catch (reason) {
        this.error =
          reason instanceof Error
            ? `${reason.name}: ${reason.message}`
            : String(reason);
        this.status = "分析失败；详细异常已打印到 Console";
        console.error(
          "[live-photo] analysis failed",
          JSON.stringify(
            {
              error: this.error,
              stack: reason instanceof Error ? reason.stack : undefined,
            },
            null,
            2
          )
        );
      } finally {
        this.busy = false;
      }
    },
    choosePhoto() {
      this.error = "";
      this.status = "正在请求相册原图";
      uni.chooseMedia({
        count: 1,
        fail: (reason) => {
          this.status = "相册选择未完成";
          this.error = reason.errMsg || "相册选择失败";
          console.error("[live-photo] picker failed", JSON.stringify(reason));
        },
        mediaType: ["image"],
        sizeType: ["original"],
        sourceType: ["album"],
        success: ({ tempFiles }) => {
          const selected = tempFiles[0];
          if (!selected) {
            this.status = "选择器没有返回文件";
            return;
          }
          const fields = selected as unknown as Record<string, unknown>;
          const path = selected.tempFilePath;
          const name =
            path.split("/").pop() || `selected.${selected.fileType || "img"}`;
          this.photo = {
            fields: Object.keys(fields),
            name,
            path,
            pickerByteSize:
              typeof fields.byteSize === "number" ? fields.byteSize : undefined,
            pickerSize:
              typeof fields.size === "number" ? fields.size : undefined,
          };
          this.forensics = null;
          this.forensicsText = "";
          this.metaprobeText = "";
          this.extractedVideoPath = "";
          this.extractedVideoText = "";
          this.extractedPhotoPath = "";
          this.extractedPhotoText = "";
          this.releaseExtractedVideo();
          this.status = "已取得选择器返回的原图；尚未上传";
          console.info(
            "[live-photo] picker result",
            JSON.stringify(
              {
                fileType: selected.fileType,
                name,
                path,
                pickerByteSize: fields.byteSize,
                pickerSize: fields.size,
                rawResult: fields,
                returnedFields: Object.keys(fields),
              },
              null,
              2
            )
          );
        },
      });
    },
    async clear() {
      await this.releaseExtractedVideo();
      this.photo = null;
      this.forensics = null;
      this.forensicsText = "";
      this.metaprobeText = "";
      this.extractedVideoPath = "";
      this.extractedVideoText = "";
      this.extractedPhotoPath = "";
      this.extractedPhotoText = "";
      this.error = "";
      this.status = "请选择 iPhone 相册中的实况照片原图";
    },
    formatSize(bytes: number) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MiB (${bytes.toLocaleString()} B)`;
    },
    async releaseExtractedVideo() {
      const temp = this.videoTemp;
      const photoTemp = this.photoTemp;
      this.videoTemp = null;
      this.photoTemp = null;
      await Promise.all([temp?.dispose(), photoTemp?.dispose()]);
    },
  },
});
</script>

<template>
  <view class="test-page">
    <view class="page-header">
      <text class="title">实况照片拆解实验</text>
      <text class="subtitle">读取选择器交付的原始文件，扫描 Live Photo 标记和视频容器，再用 metaprobe 分析图片及可能拆出的影片。不会上传。</text>
    </view>

    <wd-card title="选择实况原图" custom-class="surface-card">
      <wd-button type="primary" block round :disabled="busy" @click="choosePhoto">从相册选择一张原图</wd-button>
      <view v-if="photo" class="file-heading">
        <text class="file-name">{{ photo.name }}</text>
        <wd-tag type="primary" variant="light" size="small">image</wd-tag>
      </view>
      <image v-if="photo" class="photo-preview" :src="photo.path" mode="widthFix" />
      <view class="status"><text>{{ status }}</text></view>
      <text v-if="error" class="error">{{ error }}</text>
      <view v-if="photo" class="button-gap">
        <wd-button block round :loading="busy" :disabled="busy" @click="analyzePhoto">扫描文件并运行 metaprobe</wd-button>
      </view>
    </wd-card>

    <wd-card v-if="photo" title="选择器返回值" custom-class="surface-card">
      <text class="detail">size 原始值：{{ photo.pickerSize ?? "未提供" }}；byteSize：{{ photo.pickerByteSize ?? "未提供" }}</text>
      <text class="detail">字段：{{ photo.fields.join(", ") }}</text>
      <text v-if="forensics" class="detail">文件系统实际读取：{{ formatSize(forensics.fileSize) }}</text>
      <text v-if="forensics?.jpegEoiOffset !== undefined" class="detail">JPEG 结束标记后剩余：{{ forensics.bytesAfterJpeg }} B</text>
      <text v-if="forensics" class="detail">Live Photo/容器标记：{{ forensics.markers.length }} 种；视频容器：{{ forensics.videoBoxes.length ? "已识别" : "未识别" }}</text>
    </wd-card>

    <wd-card v-if="extractedVideoPath" title="从图片文件拆出的候选视频" custom-class="surface-card">
      <text class="detail">临时路径：{{ extractedVideoPath }}</text>
      <video class="video-preview" :src="extractedVideoPath" controls />
      <text class="hint">视频容器只是字节结构识别结果；metaprobe 能成功解析后才认为拆出的文件可用。</text>
    </wd-card>
    <wd-card v-if="extractedPhotoPath" title="从图片文件拆出的静态照片" custom-class="surface-card">
      <image class="photo-preview" :src="extractedPhotoPath" mode="widthFix" />
      <text class="detail">临时路径：{{ extractedPhotoPath }}</text>
    </wd-card>

    <wd-card v-if="forensicsText" title="文件结构与标记详情" custom-class="surface-card">
      <text class="raw-data" selectable>{{ forensicsText }}</text>
    </wd-card>
    <wd-card v-if="metaprobeText" title="metaprobe 原图分析" custom-class="surface-card">
      <text class="raw-data" selectable>{{ metaprobeText }}</text>
    </wd-card>
    <wd-card v-if="extractedVideoText" title="metaprobe 候选视频分析" custom-class="surface-card">
      <text class="raw-data" selectable>{{ extractedVideoText }}</text>
    </wd-card>
    <wd-card v-if="extractedPhotoText" title="metaprobe 拆出照片分析" custom-class="surface-card">
      <text class="raw-data" selectable>{{ extractedPhotoText }}</text>
    </wd-card>

    <view v-if="photo" class="button-gap clear-button">
      <wd-button block round :disabled="busy" @click="clear">清空本次结果</wd-button>
    </view>
  </view>
</template>

<style>
.test-page { min-height: 100vh; box-sizing: border-box; padding: 28rpx 28rpx calc(36rpx + env(safe-area-inset-bottom)); color: #242833; background: #f5f7fa; }
.page-header { padding: 8rpx 4rpx 22rpx; }
.title { display: block; color: #20242c; font-size: 38rpx; font-weight: 600; }
.subtitle { display: block; margin-top: 8rpx; color: #747b87; font-size: 23rpx; line-height: 1.5; }
.surface-card { display: block; margin-bottom: 18rpx; }
.button-gap { margin-top: 14rpx; }
.status { margin-top: 18rpx; color: #586270; font-size: 22rpx; line-height: 1.5; }
.error { display: block; margin-top: 10rpx; color: #bf353d; font-size: 22rpx; overflow-wrap: anywhere; }
.file-heading { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; margin-top: 16rpx; }
.file-name { min-width: 0; color: #343a43; font-size: 22rpx; overflow-wrap: anywhere; }
.photo-preview { width: 100%; max-height: 520rpx; margin-top: 14rpx; border-radius: 12rpx; }
.video-preview { width: 100%; margin-top: 12rpx; }
.detail { display: block; margin: 8rpx 0; color: #646d79; font-size: 21rpx; line-height: 1.55; overflow-wrap: anywhere; }
.hint { display: block; margin-top: 14rpx; color: #818894; font-size: 20rpx; line-height: 1.5; }
.raw-data { display: block; max-height: 720rpx; overflow-y: auto; padding: 14rpx; border-radius: 8rpx; color: #424953; background: #f4f6f8; font-family: monospace; font-size: 18rpx; line-height: 1.5; overflow-wrap: anywhere; white-space: pre-wrap; }
.clear-button { padding-bottom: 16rpx; }
</style>

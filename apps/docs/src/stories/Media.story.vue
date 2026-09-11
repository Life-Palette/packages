<script lang="ts" setup>
import { ref } from 'vue'
import { analyzeMedia, type MediaAnalysisResult } from '@life-palette/media'
import { selectFile } from '@life-palette/utils'

const analyzing = ref(false)
const stage = ref('')
const percent = ref(0)
const result = ref<MediaAnalysisResult | null>(null)
const previewUrl = ref('')
const error = ref('')

async function pick() {
  error.value = ''
  result.value = null
  const files = await selectFile({ accept: 'image/*,video/*', multiple: false })
  const file = files?.[0]
  if (!file) return

  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)

  analyzing.value = true
  stage.value = 'md5'
  percent.value = 0
  try {
    result.value = await analyzeMedia(file, {
      onProgress: (p) => {
        stage.value = p.stage
        percent.value = Math.round(p.percent)
      },
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    analyzing.value = false
  }
}
</script>

<template>
  <Story title="Media 媒体分析" group="media">
    <Variant title="analyzeMedia（选一张图片或一段视频）">
      <div class="demo">
        <button :disabled="analyzing" @click="pick">
          {{ analyzing ? `分析中 ${stage} ${percent}%` : '选择文件并分析' }}
        </button>
        <div v-if="analyzing" class="bar">
          <div class="bar-inner" :style="{ width: `${percent}%` }" />
        </div>
        <p v-if="error" class="err">{{ error }}</p>
        <div v-if="previewUrl" class="preview">
          <img v-if="result?.basic.type.startsWith('image') || (!result && previewUrl)" :src="previewUrl" alt="" />
        </div>
        <pre v-if="result">{{ JSON.stringify(result, null, 2) }}</pre>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.demo {
  padding: 16px;
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: #3f3023;
}
button {
  background: #8b6b4a;
  color: #fff;
  border: 0;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
}
.bar {
  margin-top: 10px;
  height: 6px;
  background: #f3e9dd;
  border-radius: 3px;
  overflow: hidden;
}
.bar-inner {
  height: 100%;
  background: #a67c52;
  transition: width 0.15s;
}
.preview img {
  margin-top: 12px;
  max-width: 240px;
  border-radius: 8px;
  border: 1px solid #e5d0b8;
}
.err {
  color: #b3402a;
}
pre {
  background: #faf6f1;
  border: 1px solid #e5d0b8;
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  max-height: 420px;
  overflow: auto;
  white-space: pre-wrap;
}
</style>

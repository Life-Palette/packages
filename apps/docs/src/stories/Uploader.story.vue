<script lang="ts" setup>
import { computed, ref } from 'vue'
import {
  PromisePool,
  withRetry,
  fileParse,
  getVideoThumbnailUrl,
  generateOssImageParams,
  parseFileName,
  detectLivePhotoPairs,
} from '@life-palette/uploader'

// ---------- PromisePool 并发演示 ----------
interface Task {
  id: number
  status: 'waiting' | 'running' | 'done'
}
const limit = ref(4)
const taskCount = ref(12)
const tasks = ref<Task[]>([])
const running = ref(false)
const poolLog = ref<string[]>([])

async function runPool() {
  running.value = true
  poolLog.value = []
  tasks.value = Array.from({ length: taskCount.value }, (_, i) => ({
    id: i + 1,
    status: 'waiting',
  }))
  const pool = new PromisePool(limit.value)
  const t0 = performance.now()
  await Promise.all(
    tasks.value.map((t) =>
      pool.run(async () => {
        t.status = 'running'
        poolLog.value.push(`#${t.id} start  +${Math.round(performance.now() - t0)}ms`)
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 800))
        t.status = 'done'
        poolLog.value.push(`#${t.id} done   +${Math.round(performance.now() - t0)}ms`)
      }),
    ),
  )
  poolLog.value.push(`全部完成，并发上限 ${limit.value}，总耗时 ${Math.round(performance.now() - t0)}ms`)
  running.value = false
}

// ---------- withRetry 演示 ----------
const retryLog = ref<string[]>([])
const retrying = ref(false)
async function runRetry() {
  retrying.value = true
  retryLog.value = []
  let attempt = 0
  try {
    await withRetry(
      async () => {
        attempt += 1
        retryLog.value.push(`第 ${attempt} 次尝试…`)
        if (attempt < 3) throw new Error(`模拟网络错误（第 ${attempt} 次）`)
        return 'ok'
      },
      5,
      400,
    )
    retryLog.value.push('第 3 次成功 ✓（指数退避 400ms → 800ms）')
  } finally {
    retrying.value = false
  }
}

// ---------- fileParse / URL 工具演示 ----------
const ossUrl = ref('https://life-palette.oss-cn-hangzhou.aliyuncs.com/uploads/2026/09/photo.heic')
const fileParseDemo = computed(() =>
  JSON.stringify(fileParse({ url: ossUrl.value, type: 'IMAGE' }), null, 2),
)
const videoUrl = ref('https://life-palette.oss-cn-hangzhou.aliyuncs.com/uploads/2026/09/clip.mp4')
const videoThumbDemo = computed(() => getVideoThumbnailUrl(videoUrl.value))
const ossParamsDemo = computed(() => generateOssImageParams(4032, 3024, 800))
const fileNameInput = ref('IMG_2048.MOV')
const fileNameDemo = computed(() => JSON.stringify(parseFileName(fileNameInput.value)))

// ---------- 实况照片配对 ----------
const livePhotoDemo = computed(() =>
  JSON.stringify(
    detectLivePhotoPairs([
      { name: 'IMG_0001.HEIC', type: 'image/heic' },
      { name: 'IMG_0001.MOV', type: 'video/quicktime' },
      { name: 'IMG_0002.JPG', type: 'image/jpeg' },
    ]),
    null,
    2,
  ),
)
</script>

<template>
  <Story title="Uploader 上传工具" group="uploader">
    <Variant title="PromisePool 并发池（分片上传同款）">
      <div class="demo">
        <label>并发上限：<input v-model.number="limit" type="number" min="1" max="8" /></label>
        <label>任务数：<input v-model.number="taskCount" type="number" min="1" max="30" /></label>
        <button :disabled="running" @click="runPool">{{ running ? '运行中…' : '运行' }}</button>
        <div class="chips">
          <span
            v-for="t in tasks"
            :key="t.id"
            class="chip"
            :class="t.status"
          >{{ t.id }}</span>
        </div>
        <pre>{{ poolLog.join('\n') }}</pre>
      </div>
    </Variant>

    <Variant title="withRetry 指数退避重试">
      <div class="demo">
        <button :disabled="retrying" @click="runRetry">{{ retrying ? '重试中…' : '模拟前 2 次失败' }}</button>
        <pre>{{ retryLog.join('\n') }}</pre>
      </div>
    </Variant>

    <Variant title="fileParse（HEIC → 缩略图/转格式 URL）">
      <div class="demo">
        <input v-model="ossUrl" class="wide" />
        <pre>{{ fileParseDemo }}</pre>
      </div>
    </Variant>

    <Variant title="getVideoThumbnailUrl / generateOssImageParams">
      <div class="demo">
        <input v-model="videoUrl" class="wide" />
        <pre>封面：{{ videoThumbDemo }}

图片处理参数（4032×3024 → w800）：
{{ ossParamsDemo }}</pre>
      </div>
    </Variant>

    <Variant title="parseFileName / detectLivePhotoPairs">
      <div class="demo">
        <input v-model="fileNameInput" class="wide" />
        <pre>{{ fileNameDemo }}

实况配对（HEIC+MOV 同名 → 一对）：
{{ livePhotoDemo }}</pre>
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
.demo label {
  margin-right: 16px;
  font-size: 14px;
}
.wide {
  width: 100%;
  box-sizing: border-box;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0;
}
.chip {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  background: #f3e9dd;
  color: #8b6b4a;
}
.chip.running {
  background: #c29468;
  color: #fff;
}
.chip.done {
  background: #6f8f5a;
  color: #fff;
}
pre {
  background: #faf6f1;
  border: 1px solid #e5d0b8;
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
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
</style>

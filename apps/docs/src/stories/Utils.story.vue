<script lang="ts" setup>
import {
  formatRelativeTime,
  getPageNumbers,
  parseUrl,
  sleep,
  stripMarkdown,
} from "@life-palette/utils";
import { computed, ref } from "vue";

// --- date ---
const minutesAgo = ref(5);
const relativeDemo = computed(() =>
  formatRelativeTime(
    new Date(Date.now() - minutesAgo.value * 60_000).toISOString()
  )
);

// --- url ---
const urlInput = ref("/album/detail?id=42&tag=旅行&tag=2026#comments");
const urlDemo = computed(() => {
  try {
    return JSON.stringify(parseUrl(urlInput.value), null, 2);
  } catch (e) {
    return String(e);
  }
});

// --- pagination ---
const currentPage = ref(5);
const totalPages = ref(12);
const pageDemo = computed(() =>
  JSON.stringify(getPageNumbers(currentPage.value, totalPages.value))
);

// --- markdown ---
const mdInput = ref(
  "# 标题\n\n这是 **加粗** 和 [链接](https://example.com) 以及 `代码`。"
);
const mdDemo = computed(() => stripMarkdown(mdInput.value));

// --- async ---
const sleepLog = ref<string[]>([]);
const sleeping = ref(false);
async function runSleep() {
  sleeping.value = true;
  sleepLog.value = [`start  ${new Date().toLocaleTimeString()}`];
  await sleep(1000);
  sleepLog.value.push(`+1s    ${new Date().toLocaleTimeString()}`);
  sleeping.value = false;
}
</script>

<template>
  <Story title="Utils 纯函数" group="utils">
    <Variant title="formatRelativeTime">
      <div class="demo">
        <label>分钟前：<input v-model.number="minutesAgo" type="number" min="0" /></label>
        <pre>{{ relativeDemo }}</pre>
      </div>
    </Variant>
    <Variant title="parseUrl">
      <div class="demo">
        <input v-model="urlInput" class="wide" />
        <pre>{{ urlDemo }}</pre>
      </div>
    </Variant>
    <Variant title="getPageNumbers">
      <div class="demo">
        <label>当前页：<input v-model.number="currentPage" type="number" min="1" :max="totalPages" /></label>
        <label>总页数：<input v-model.number="totalPages" type="number" min="1" max="99" /></label>
        <pre>{{ pageDemo }}</pre>
      </div>
    </Variant>
    <Variant title="stripMarkdown">
      <div class="demo">
        <textarea v-model="mdInput" class="wide" rows="4" />
        <pre>{{ mdDemo }}</pre>
      </div>
    </Variant>
    <Variant title="sleep">
      <div class="demo">
        <button :disabled="sleeping" @click="runSleep">{{ sleeping ? '等待中…' : 'sleep(1000)' }}</button>
        <pre>{{ sleepLog.join('\n') }}</pre>
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
pre {
  background: #faf6f1;
  border: 1px solid #e5d0b8;
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
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
  opacity: 0.5;
}
</style>

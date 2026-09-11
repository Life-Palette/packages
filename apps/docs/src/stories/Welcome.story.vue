<script lang="ts" setup>
const packages = [
  {
    name: '@life-palette/utils',
    desc: '纯函数工具集：async / date / url / pagination / markdown / browser，零运行时依赖',
    deps: '0 dependencies',
  },
  {
    name: '@life-palette/media',
    desc: '媒体文件分析：MD5（hash-wasm）、图片 EXIF / 主色 / BlurHash / ArtHash、视频 metadata（mediainfo.js）',
    deps: 'exifr · blurhash · arthash · mediainfo.js · hash-wasm',
  },
  {
    name: '@life-palette/uploader',
    desc: 'OSS 上传：并发分片、单片重试、断点续传 etags、批量并发、实况照片配对、URL 工具',
    deps: '@life-palette/media · browser-image-compression (optional peer)',
  },
]
</script>

<template>
  <Story title="Welcome" group="top">
    <Variant title="Life Palette Packages">
      <div class="welcome">
        <h1>拾色 Packages</h1>
        <p class="sub">Life Palette 前端 monorepo 的交互式文档与演示</p>
        <div v-for="p in packages" :key="p.name" class="card">
          <div class="name">{{ p.name }}</div>
          <div class="desc">{{ p.desc }}</div>
          <div class="deps">{{ p.deps }}</div>
        </div>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.welcome {
  max-width: 720px;
  padding: 24px;
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: #3f3023;
}
h1 {
  margin: 0 0 4px;
  font-size: 28px;
  color: #6f563c;
}
.sub {
  margin: 0 0 20px;
  color: #8b6b4a;
}
.card {
  border: 1px solid #e5d0b8;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 12px;
  background: #faf6f1;
}
.name {
  font-weight: 700;
  font-family: ui-monospace, monospace;
  color: #6f563c;
}
.desc {
  margin: 6px 0;
  font-size: 14px;
  line-height: 1.6;
}
.deps {
  font-size: 12px;
  color: #a67c52;
  font-family: ui-monospace, monospace;
}
</style>

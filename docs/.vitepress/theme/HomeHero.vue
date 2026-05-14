<script setup lang="ts">
defineOptions({ name: "HomeHero" });
</script>

<template>
  <div class="hero-artistic">
    <div class="hero-glow"></div>
    <div class="hero-content">
      <div class="hero-chinese">拾色</div>
      <div class="hero-english">Life Palette</div>
      <p class="hero-desc">工具包集合</p>
      <div class="hero-actions">
        <a class="hero-btn primary" href="/guide/getting-started">快速开始</a>
        <a class="hero-btn" href="/packages/utils/">Packages</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-artistic {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  overflow: hidden;
}

.hero-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 700px;
  height: 700px;
  background:
    radial-gradient(ellipse at 30% 35%, rgba(255, 180, 130, 0.25) 0%, transparent 50%),
    radial-gradient(ellipse at 70% 25%, rgba(180, 225, 180, 0.22) 0%, transparent 45%),
    radial-gradient(ellipse at 55% 70%, rgba(170, 200, 245, 0.18) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 55%, rgba(240, 190, 220, 0.15) 0%, transparent 40%);
  filter: blur(50px);
  pointer-events: none;
  border-radius: 50%;
}

.dark .hero-glow {
  opacity: 0.3;
}

.hero-content {
  position: relative;
  z-index: 1;
  text-align: center;
}

.hero-chinese {
  font-size: 120px;
  font-weight: 200;
  letter-spacing: 0.15em;
  line-height: 1.1;
  font-family: "STKaiti", "KaiTi", serif;
  background: linear-gradient(135deg, #6b5040 0%, #8b6b4a 30%, #5a7a6a 60%, #6a7a9a 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.dark .hero-chinese {
  background: linear-gradient(135deg, #d4b896 0%, #c4a67e 30%, #9abfad 60%, #a0b8d0 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-english {
  font-size: 18px;
  font-weight: 300;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  margin-top: 16px;
}

.hero-desc {
  font-size: 15px;
  color: var(--vp-c-text-2);
  margin-top: 24px;
  font-weight: 300;
  letter-spacing: 0.05em;
}

.hero-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 36px;
}

.hero-btn {
  padding: 10px 24px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.2s ease;
  border: 1px solid var(--vp-c-border);
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
}

.hero-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.hero-btn.primary {
  background: var(--vp-c-brand-1);
  color: #fff;
  border-color: var(--vp-c-brand-1);
}

.hero-btn.primary:hover {
  background: var(--vp-c-brand-2);
  border-color: var(--vp-c-brand-2);
  color: #fff;
}
</style>

---
layout: page
---

<HomeHero />

<div class="features-section">
  <div class="features-grid">
    <a class="feature-card" href="/packages/utils/">
      <h3>@life-palette/utils</h3>
      <p>文件处理、文件选择等实用工具库</p>
    </a>
    <div class="feature-card">
      <h3>TypeScript</h3>
      <p>完整的类型定义，良好的开发体验</p>
    </div>
    <div class="feature-card">
      <h3>Tree-shakable</h3>
      <p>ESM + CJS 双格式输出，支持按需引入</p>
    </div>
  </div>
</div>

<style>
.features-section {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px 80px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 768px) {
  .features-grid {
    grid-template-columns: 1fr;
  }
}

.feature-card {
  padding: 24px;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg);
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.feature-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
}

.dark .feature-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.feature-card h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--vp-c-text-1);
}

.feature-card p {
  font-size: 14px;
  color: var(--vp-c-text-2);
  margin: 0;
  line-height: 1.5;
}
</style>

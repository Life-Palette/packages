import { defineConfig } from "vitepress";

export default defineConfig({
  title: "@life-palette/utils",
  description: "一个实用的工具库，提供文件处理、文件选择等常用功能",
  themeConfig: {
    nav: [
      { text: "指南", link: "/guide/getting-started" },
      { text: "API", link: "/guide/api" },
      { text: "Changelog", link: "/changelog" },
    ],
    sidebar: [
      {
        text: "指南",
        items: [
          { text: "快速开始", link: "/guide/getting-started" },
          { text: "API 文档", link: "/guide/api" },
          { text: "发版说明", link: "/guide/release" },
        ],
      },
      {
        text: "其他",
        items: [{ text: "Changelog", link: "/changelog" }],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/Life-Palette/packages" },
    ],
  },
});

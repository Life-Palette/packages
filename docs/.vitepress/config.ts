import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Life Palette",
  description: "Life Palette 工具包集合",
  themeConfig: {
    nav: [
      { text: "指南", link: "/guide/getting-started" },
      {
        text: "Packages",
        items: [{ text: "@life-palette/utils", link: "/packages/utils/" }],
      },
      { text: "Changelog", link: "/changelog" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "指南",
          items: [
            { text: "快速开始", link: "/guide/getting-started" },
            { text: "发版说明", link: "/guide/release" },
          ],
        },
      ],
      "/packages/utils/": [
        {
          text: "@life-palette/utils",
          items: [
            { text: "概览", link: "/packages/utils/" },
            { text: "API", link: "/packages/utils/api" },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/Life-Palette/packages" },
    ],
  },
});

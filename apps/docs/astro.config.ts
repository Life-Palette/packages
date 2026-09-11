import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "Life Palette",
      description: "拾色 (Life Palette) packages documentation",
      defaultLocale: "zh-cn",
      locales: {
        "zh-cn": {
          label: "简体中文",
          lang: "zh-CN",
        },
        root: {
          label: "English",
          lang: "en",
        },
      },
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/Life-Palette/packages" },
      ],
      sidebar: [
        {
          label: "入门",
          items: [
            { label: "快速开始", slug: "getting-started" },
            { label: "发版流程", slug: "release" },
          ],
        },
        {
          label: "Packages",
          items: [
            { label: "@life-palette/utils", slug: "packages/utils" },
            { label: "@life-palette/media", slug: "packages/media" },
            { label: "@life-palette/uploader", slug: "packages/uploader" },
          ],
        },
      ],
      customCss: ["./src/styles/custom.css"],
      components: {
        Header: "./src/components/Header.astro",
      },
      expressiveCode: {
        themes: ["github-light", "github-dark"],
        styleOverrides: {
          borderRadius: "0.375rem",
        },
      },
    }),
  ],
});

# @life-palette/uploader

## 2.0.1

### Patch Changes

- [`03ec375`](https://github.com/Life-Palette/packages/commit/03ec375bcd0c59af37e5aefae20353cdc4b8b53e) Thanks [@IceyWu](https://github.com/IceyWu)! - Normalize ISO sensitivity from `PhotographicSensitivity` and `ISOSpeedRatings` EXIF tags.
  Update the uploader's media dependency so uploaded image metadata includes the normalized camera ISO value.
- Updated dependencies [[`03ec375`](https://github.com/Life-Palette/packages/commit/03ec375bcd0c59af37e5aefae20353cdc4b8b53e)]:
  - @life-palette/media@0.2.4

## 2.0.0

### Major Changes

- [`8771298`](https://github.com/Life-Palette/packages/commit/8771298753995efe342383c08bcc1a317f63601b) Thanks [@IceyWu](https://github.com/IceyWu)! - Rename `createOssUploader` to `createUploader` to reflect provider-neutral presigned uploads. Remove the old factory export without a compatibility alias. Upload behavior and EXIF-preserving compression are unchanged.

## 1.0.0

### Major Changes

- [`fef2eba`](https://github.com/Life-Palette/packages/commit/fef2ebaf442072454e97f1faae0cc9c49c853e0c) Thanks [@IceyWu](https://github.com/IceyWu)! - Replace the legacy OSS policy uploader with the unified presigned upload client under `createOssUploader`. Remove `createUploaderV2`, legacy uploader methods, options, and response aliases.
  
  Use `/uploads` sessions for direct and multipart uploads, resumable parts, retries, instant uploads, and completion. Analyze media separately with `@life-palette/media`, pass metadata and checksums to `upload`, and use returned file `uid` values. The factory returns `upload` and `abort` only.
  
  Keep optional image compression through the shared `compressImage` helper. Detect JPEG/PNG/WebP from file bytes, restore and validate original EXIF blocks byte-for-byte, preserve orientation, dimensions and filenames, and leave animated or unsupported media unchanged. Compress before analysis so metadata and checksums describe the uploaded bytes. Include the compression dependency and validate real compression and all JPEG orientations in browser tests.

## 0.2.3

### Patch Changes

- [`9fe8f9e`](https://github.com/Life-Palette/packages/commit/9fe8f9edea8f935d6afc00bfadfdcaaf08c5e9e7) Thanks [@IceyWu](https://github.com/IceyWu)! - Include the arthash WebAssembly asset in the published media output and update the uploader release so browser consumers can use media analysis without bundler-specific workarounds.
- Updated dependencies [[`9fe8f9e`](https://github.com/Life-Palette/packages/commit/9fe8f9edea8f935d6afc00bfadfdcaaf08c5e9e7)]:
  - @life-palette/media@0.2.3

## 0.2.2

### Patch Changes

- 修复媒体元数据测试在不同 Node 环境下的 `metaprobe` 解析，并提升上传器在严格 TypeScript 配置下的兼容性。
- Updated dependencies []:
  - @life-palette/media@0.2.2

## 0.2.1

### Patch Changes

- [`fe60ef6`](https://github.com/Life-Palette/packages/commit/fe60ef6e6a010927b4573aa4120095eb0d4e8723) Thanks [@IceyWu](https://github.com/IceyWu)! - Fix browser media metadata extraction with the published metaprobe WASM package and make anonymous Live Photo association work through the unified upload flow.
- Updated dependencies [[`fe60ef6`](https://github.com/Life-Palette/packages/commit/fe60ef6e6a010927b4573aa4120095eb0d4e8723)]:
  - @life-palette/media@0.2.1

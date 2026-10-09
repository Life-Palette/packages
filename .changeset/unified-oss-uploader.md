---
"@life-palette/uploader": major
---

Replace the legacy OSS policy uploader with the unified presigned upload client under `createOssUploader`. Remove `createUploaderV2`, legacy uploader methods, options, and response aliases.

Use `/uploads` sessions for direct and multipart uploads, resumable parts, retries, instant uploads, and completion. Analyze media separately with `@life-palette/media`, pass metadata and checksums to `upload`, and use returned file `uid` values. The factory returns `upload` and `abort` only.

Keep optional image compression through the shared `compressImage` helper. Detect JPEG/PNG/WebP from file bytes, restore and validate original EXIF blocks byte-for-byte, preserve orientation, dimensions and filenames, and leave animated or unsupported media unchanged. Compress before analysis so metadata and checksums describe the uploaded bytes. Include the compression dependency and validate real compression and all JPEG orientations in browser tests.

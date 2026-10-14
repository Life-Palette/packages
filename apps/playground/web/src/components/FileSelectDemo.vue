<script setup lang="ts">
import { readFile, selectFile } from "@life-palette/utils";
import { ref } from "vue";

const selectedFiles = ref<File[]>([]);
const previews = ref<string[]>([]);

const handleSelectSingleImage = async () => {
  const files = await selectFile({
    accept: "image/*",
    multiple: false,
  });
  await processFiles(files);
};

const handleSelectMultiImages = async () => {
  const files = await selectFile({
    accept: "image/*",
    multiple: true,
  });
  await processFiles(files);
};

const handleSelectDocuments = async () => {
  const files = await selectFile({
    accept: ".pdf,.doc,.docx,.txt",
    multiple: true,
  });
  await processFiles(files);
};

const handleSelectAny = async () => {
  const files = await selectFile({
    multiple: true,
  });
  await processFiles(files);
};

const processFiles = async (files: FileList | null) => {
  if (!files || files.length === 0) {
    return;
  }

  selectedFiles.value = Array.from(files);
  previews.value = [];

  for (const file of selectedFiles.value) {
    if (file.type.startsWith("image/")) {
      const content = await readFile(file, "dataURL");
      if (typeof content === "string") {
        previews.value.push(content);
      }
    }
  }
};
</script>

<template>
  <div class="demo-container">
    <div class="card">
      <div class="button-group">
        <button @click="handleSelectSingleImage">Single Image</button>
        <button @click="handleSelectMultiImages">Multiple Images</button>
        <button @click="handleSelectDocuments">Documents</button>
        <button @click="handleSelectAny">Any File</button>
      </div>

      <div v-if="selectedFiles.length > 0" class="result">
        <div class="files-list">
          <div
            v-for="(file, index) in selectedFiles"
            :key="index"
            class="file-item"
          >
            <div class="file-info">
              <div class="file-name">{{ file.name }}</div>
              <div class="file-size">{{ file.size }} bytes</div>
            </div>
          </div>
        </div>

        <div v-if="previews.length > 0" class="preview">
          <img
            v-for="(preview, index) in previews"
            :key="index"
            :src="preview"
            :alt="`Preview ${index + 1}`"
            class="preview-img"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo-container {
  width: 100%;
}

.card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 24px;
}

.button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  background: #1a1a1a;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

button:hover {
  background: #333;
}

button:active {
  background: #000;
}

.result {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #e0e0e0;
}

.files-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-item {
  padding: 12px;
  background: #f9f9f9;
  border-radius: 6px;
}

.file-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.file-name {
  font-size: 14px;
  color: #1a1a1a;
  font-weight: 500;
  word-break: break-all;
  flex: 1;
}

.file-size {
  font-size: 13px;
  color: #666;
  white-space: nowrap;
}

.preview {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.preview-img {
  width: 100%;
  height: 150px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid #e0e0e0;
}
</style>
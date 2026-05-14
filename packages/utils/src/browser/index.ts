/**
 * 浏览器环境工具（文件选择、文件读取、设备检测等）
 */

// ─── 文件选择 ────────────────────────────────────────────

export interface FileSelectOptions {
  /** 接受的文件类型，如 'image/*', '.jpg,.png' 等 */
  accept?: string;
  /** 是否捕获（用于移动设备） */
  capture?: boolean | string;
  /** 文件选择器的 ID */
  id?: string;
  /** 是否允许多选 */
  multiple?: boolean;
  /** 选择文件后的回调函数 */
  onChange?: (files: FileList | null) => void;
}

/**
 * 触发文件选择器
 */
export function selectFile(
  options: FileSelectOptions = {}
): Promise<FileList | null> {
  if (typeof document === "undefined") {
    return Promise.reject(
      new Error("selectFile() can only be used in browser environment")
    );
  }

  const {
    accept = "*",
    multiple = false,
    capture,
    onChange,
    id = `file-input-${Date.now()}`,
  } = options;

  return new Promise((resolve) => {
    let input = document.getElementById(id) as HTMLInputElement;

    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = id;
      input.style.display = "none";
      document.body.append(input);
    }

    input.accept = accept;
    input.multiple = multiple;

    if (capture !== undefined) {
      if (typeof capture === "boolean") {
        if (capture) {
          input.setAttribute("capture", "");
        } else {
          input.removeAttribute("capture");
        }
      } else {
        input.setAttribute("capture", capture);
      }
    }

    input.value = "";

    const handleChange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      const files = target.files;
      onChange?.(files);
      input.removeEventListener("change", handleChange);
      input.removeEventListener("cancel", handleCancel);
      resolve(files);
    };

    const handleCancel = () => {
      input.removeEventListener("change", handleChange);
      input.removeEventListener("cancel", handleCancel);
      resolve(null);
    };

    input.addEventListener("change", handleChange);
    input.addEventListener("cancel", handleCancel);
    input.click();
  });
}

/**
 * 读取文件内容
 */
export function readFile(
  file: File,
  readAs: "dataURL" | "text" | "arrayBuffer" | "binaryString" = "dataURL"
): Promise<string | ArrayBuffer | null> {
  if (typeof FileReader === "undefined") {
    return Promise.reject(
      new Error("readFile() can only be used in browser environment")
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", (event) => {
      resolve(event.target?.result || null);
    });
    reader.onerror = (error) => reject(error);

    switch (readAs) {
      case "dataURL":
        reader.readAsDataURL(file);
        break;
      case "text":
        reader.readAsText(file);
        break;
      case "arrayBuffer":
        reader.readAsArrayBuffer(file);
        break;
      case "binaryString":
        reader.readAsBinaryString(file);
        break;
      default:
        reader.readAsDataURL(file);
    }
  });
}

// ─── 设备与网络检测 ──────────────────────────────────────

/**
 * 预加载图片
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * 批量预加载图片
 */
export async function preloadImages(srcs: string[]): Promise<void> {
  await Promise.all(srcs.map(preloadImage));
}

interface NetworkInformation {
  downlink?: number;
  effectiveType?: string;
}

/**
 * 检测是否为慢速网络
 */
export function isSlowNetwork(): boolean {
  const nav = navigator as unknown as Record<string, unknown>;
  const connection = (nav.connection ||
    nav.mozConnection ||
    nav.webkitConnection) as NetworkInformation | undefined;

  if (!connection) {
    return false;
  }

  const slowTypes = ["slow-2g", "2g", "3g"];
  if (
    connection.effectiveType &&
    slowTypes.includes(connection.effectiveType)
  ) {
    return true;
  }
  if (connection.downlink && connection.downlink < 1) {
    return true;
  }

  return false;
}

/**
 * 获取设备类型
 */
export function getDeviceType(): "mobile" | "tablet" | "desktop" {
  const width = window.innerWidth;
  if (width < 768) {
    return "mobile";
  }
  if (width < 1024) {
    return "tablet";
  }
  return "desktop";
}

/**
 * 检测是否支持 WebP 格式
 */
export function supportsWebP(): Promise<boolean> {
  return new Promise((resolve) => {
    const webP = new Image();
    webP.onload = webP.onerror = () => resolve(webP.height === 2);
    webP.src =
      "data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA";
  });
}

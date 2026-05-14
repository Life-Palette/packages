import { customDestr, get } from "@iceywu/utils";

// 定义 Exif 数据的类型
export interface ExifData {
  Make?: {
    value: string;
  };
}

// 定义 data 对象的类型
export interface FileData {
  cover?: string;
  exif?: string;
  fromIphone?: boolean;
  type?: string;
  url?: string;
  videoSrc?: string | null;
  [key: string]: unknown;
}

// 定义 options 对象的类型
export interface ParseOptions {
  format?: string;
  resize?: number;
}

/**
 * 检查数据是否为苹果设备拍摄的图片
 * @param data 包含图片信息的数据对象
 * @returns 如果是苹果设备拍摄的图片返回 true，否则返回 false
 */
export function isIphoneImg(data: FileData): boolean {
  const exif = get(data, "exif", "{}");
  const exifData = customDestr(exif, { customVal: {} }) as ExifData;
  return get(exifData, "Make.value") === "Apple";
}

/**
 * 返回文件的 cover
 * @param data 包含文件信息的数据对象
 * @param options 配置参数，包含 format 和 resize 选项
 * @returns 处理后的文件信息对象
 */
export function fileParse(data: FileData, _options?: ParseOptions): FileData {
  const { url = "", type = "image/jpeg", cover = "", fromIphone } = data || {};
  const fileType = type.toUpperCase().includes("VIDEO") ? "VIDEO" : "IMAGE";
  const file = url;
  const isIphone = isIphoneImg(data);
  const addInfo: { baseSrc: string; thumbnailUrl: string; cover: string } = {
    baseSrc: "",
    thumbnailUrl: "",
    cover: "",
  };

  const { format = "jpg", resize = 400 } = _options || {};

  if (fileType === "IMAGE") {
    let thumbnailUrl = `${file}?x-oss-process=image/resize,l_${resize}`;
    let baseSrc = url;
    const fileSuffix = file
      .slice(Math.max(0, file.lastIndexOf(".")))
      .toLowerCase();
    if (
      ([".heic", ".HEIC"].includes(fileSuffix) || isIphone || fromIphone) &&
      !file.includes(`format,${format}`)
    ) {
      baseSrc = `${url}?x-oss-process=image/format,${format}`;
      thumbnailUrl = `${file}?x-oss-process=image/resize,l_800/format,${format}`;
    }
    addInfo.baseSrc = baseSrc;
    addInfo.thumbnailUrl = thumbnailUrl;
  } else if (fileType === "VIDEO") {
    const coverUrl =
      cover ||
      `${url}?x-oss-process=video/snapshot,t_7000,f_${format},w_0,h_0,m_fast`;

    addInfo.cover = coverUrl;
  }

  const baseData: FileData & { fileType: string } = {
    ...data,
    ...addInfo,
    fileType,
  };

  return baseData;
}

/**
 * 文件选择配置选项
 */
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
 * @param options 文件选择配置项
 * @returns 返回一个 Promise，resolve 时返回选中的文件列表
 * @throws 如果在非浏览器环境中调用，会抛出错误
 * @example
 * ```ts
 * // 基础用法
 * const files = await selectFile({
 *   accept: 'image/*',
 *   multiple: true
 * });
 *
 * // 使用回调
 * selectFile({
 *   accept: '.pdf,.doc',
 *   multiple: false,
 *   onChange: (files) => {
 *     console.log('选中的文件:', files);
 *   }
 * });
 * ```
 */
export function selectFile(
  options: FileSelectOptions = {}
): Promise<FileList | null> {
  // 检查是否在浏览器环境
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
    // 查找或创建 input 元素
    let input = document.getElementById(id) as HTMLInputElement;

    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = id;
      input.style.display = "none";
      document.body.append(input);
    }

    // 设置属性
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

    // 重置 input 以允许选择相同文件
    input.value = "";

    // 处理文件选择
    const handleChange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      const files = target.files;

      // 调用回调函数
      if (onChange) {
        onChange(files);
      }

      // 清理事件监听器
      input.removeEventListener("change", handleChange);
      input.removeEventListener("cancel", handleCancel);

      resolve(files);
    };

    // 处理取消操作
    const handleCancel = () => {
      input.removeEventListener("change", handleChange);
      input.removeEventListener("cancel", handleCancel);
      resolve(null);
    };

    // 添加事件监听器
    input.addEventListener("change", handleChange);
    input.addEventListener("cancel", handleCancel);

    // 触发文件选择
    input.click();
  });
}

/**
 * 读取文件内容
 * @param file 要读取的文件
 * @param readAs 读取方式，默认为 'dataURL'
 * @returns 返回一个 Promise，resolve 时返回文件内容
 * @throws 如果在非浏览器环境中调用，会抛出错误
 * @example
 * ```ts
 * const files = await selectFile({ accept: 'image/*' });
 * if (files && files.length > 0) {
 *   const content = await readFile(files[0], 'dataURL');
 *   console.log(content);
 * }
 * ```
 */
export function readFile(
  file: File,
  readAs: "dataURL" | "text" | "arrayBuffer" | "binaryString" = "dataURL"
): Promise<string | ArrayBuffer | null> {
  // 检查是否在浏览器环境
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

    reader.onerror = (error) => {
      reject(error);
    };

    switch (readAs) {
      case "dataURL": {
        reader.readAsDataURL(file);
        break;
      }
      case "text": {
        reader.readAsText(file);
        break;
      }
      case "arrayBuffer": {
        reader.readAsArrayBuffer(file);
        break;
      }
      case "binaryString": {
        reader.readAsBinaryString(file);
        break;
      }
      default: {
        reader.readAsDataURL(file);
      }
    }
  });
}

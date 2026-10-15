import { getUni, nativeCall } from "./transport";
import {
  PermissionError,
  SelectionCancelledError,
  type UniPlatform,
  type UniRuntime,
  UploadError,
  type UploadFile,
} from "./types";

export interface ChooseImagesOptions {
  /** Native-only business permission/privacy checks. H5 must open the picker in the user gesture. */
  beforeChoose?: () => Promise<unknown>;
  count?: number;
  sizeType?: Array<"original" | "compressed">;
  sourceType?: Array<"album" | "camera">;
  uni?: UniRuntime;
}

export async function chooseImages(
  options: ChooseImagesOptions = {}
): Promise<UploadFile[]> {
  const api = getUni(options.uni);
  if (!api.chooseImage) {
    throw new UploadError("uni.chooseImage is unavailable");
  }

  const platform = api.getSystemInfoSync?.().uniPlatform;
  const isH5 = platform
    ? platform === "web" || platform === "h5"
    : typeof document !== "undefined";

  const openPicker = () =>
    new Promise<UploadFile[]>((resolve, reject) => {
      api.chooseImage?.({
        count: options.count ?? 9,
        fail: (error) =>
          reject(
            /cancel/i.test(error.errMsg ?? "")
              ? new SelectionCancelledError({ cause: error })
              : new UploadError(error.errMsg || "Image selection failed", {
                  cause: error,
                })
          ),
        sizeType: options.sizeType ?? ["original"],
        sourceType: options.sourceType ?? ["album", "camera"],
        success: (result) =>
          resolve(
            result.tempFilePaths.map((path, index) => {
              const file = result.tempFiles[index];
              return {
                name: file?.name || file?.file?.name,
                path,
                sourceFile: file?.file,
              };
            })
          ),
      });
    });

  // Browser pickers require transient user activation. Do not await permission
  // checks (or any other promise) before calling chooseImage on H5.
  if (isH5) {
    return openPicker();
  }

  await options.beforeChoose?.();
  return openPicker();
}

export interface PermissionConfig {
  platform: UniPlatform;
  uni?: UniRuntime;
}

export type PermissionState =
  | "authorized"
  | "denied"
  | "undetermined"
  | "unsupported";

/** Mini-program scopes are supplied explicitly: album picking does not require writePhotosAlbum. */
export async function checkPermission(
  permission: string,
  config: PermissionConfig
): Promise<PermissionState> {
  if (config.platform === "h5") {
    return "unsupported";
  }
  const api = getUni(config.uni);
  if (config.platform === "app") {
    const setting = api.getAppAuthorizeSetting?.();
    const state =
      permission === "camera"
        ? setting?.cameraAuthorized
        : permission === "album"
          ? setting?.albumAuthorized
          : undefined;
    if (!state) {
      return "unsupported";
    }
    return state === "authorized" || state === "denied"
      ? state
      : "undetermined";
  }
  if (!api.getSetting) {
    return "unsupported";
  }
  const result = await nativeCall<{
    authSetting: Record<string, boolean | undefined>;
  }>((callbacks) => api.getSetting?.(callbacks));
  const state = result.authSetting[permission];
  return state === undefined ? "undetermined" : state ? "authorized" : "denied";
}

export async function ensurePermission(
  permission: string,
  config: PermissionConfig
): Promise<PermissionState> {
  const state = await checkPermission(permission, config);
  if (state === "denied") {
    throw new PermissionError(permission);
  }
  if (state !== "undetermined" || config.platform !== "mp") {
    // App/H5 permission prompts belong to the native picker/browser operation.
    return state;
  }
  const api = getUni(config.uni);
  if (!api.authorize) {
    return "unsupported";
  }
  try {
    await nativeCall((callbacks) =>
      api.authorize?.({ ...callbacks, scope: permission })
    );
    return "authorized";
  } catch (error) {
    throw new PermissionError(permission, { cause: error });
  }
}

/** Call from a user gesture after explaining why access is needed. No automatic settings UI. */
export async function openPermissionSettings(
  config: PermissionConfig
): Promise<void> {
  const api = getUni(config.uni);
  const open =
    config.platform === "mp"
      ? api.openSetting
      : config.platform === "app"
        ? api.openAppAuthorizeSetting
        : undefined;
  if (!open) {
    throw new UploadError(
      "Permission settings are unavailable on this platform"
    );
  }
  await nativeCall((callbacks) => open.call(api, callbacks));
}

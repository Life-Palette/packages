/**
 * 通用 URL 解析工具（仅依赖原生）
 */

/** 简易 path 解析：支持带 query 的相对/绝对路径 */
export function parseUrl(fullPath: string): {
  name: string;
  path: string;
  query: Record<string, string>;
} {
  const [path, queryStr] = fullPath.split("?");
  const name = path.slice(path.lastIndexOf("/") + 1);
  const query: Record<string, string> = {};
  queryStr
    ?.split("&")
    .map((kv) => kv.split("="))
    .forEach(([k, v]) => {
      if (k) query[k] = v ?? "";
    });
  return { name, path, query };
}

/** 把 query 拼回到 path 上 */
export function restoreUrl(
  path: string,
  query: Record<string, unknown> = {}
): string {
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return qs ? `${path}?${qs}` : path;
}

/** 防止快速重复点击：在指定毫秒内只允许一次 */
let lastClickTime = 0;
export function isFastClick(threshold = 1000): boolean {
  const now = Date.now();
  const fast = now - lastClickTime <= threshold;
  lastClickTime = now;
  return fast;
}

/**
 * Markdown 纯文本处理
 *
 * 注意：本模块只做**正则级**处理，不依赖 marked / markdown-it。
 *      需要把 Markdown 渲染成 HTML 时请在业务层自行调用解析器。
 */

const RE_FRONTMATTER = /^---[\s\S]*?---\s*/m;
const RE_HTML_COMMENT = /<!--[\s\S]*?-->/g;
const RE_HTML_TAG = /<[^>]+>/g;
const RE_HEADING = /^#{1,6}\s+/gm;
const RE_BOLD = /\*\*(.+?)\*\*/g;
const RE_ITALIC = /\*(.+?)\*/g;
const RE_STRIKETHROUGH = /~~(.+?)~~/g;
const RE_CODE_BLOCK = /`{3}[\s\S]*?`{3}/g;
const RE_INLINE_CODE = /`([^`]+)`/g;
const RE_IMAGE = /!\[([^\]]*)\]\([^)]+\)/g;
const RE_LINK = /\[([^\]]+)\]\([^)]+\)/g;
const RE_BLOCKQUOTE = /^>\s+/gm;
const RE_UNORDERED_LIST = /^[-*+]\s+/gm;
const RE_ORDERED_LIST = /^\d+\.\s+/gm;
const RE_HR = /^---+$/gm;
const RE_MULTI_NEWLINE = /\n{2,}/g;
const RE_MULTI_SPACE = /\s+/g;

/**
 * 去除 Markdown 语法、保留可读纯文本（用于列表摘要）
 */
export function stripMarkdown(content: string): string {
  if (!content) {
    return "";
  }
  return content
    .replace(RE_FRONTMATTER, "")
    .replace(RE_HTML_COMMENT, "")
    .replace(RE_HTML_TAG, "")
    .replace(RE_HEADING, "")
    .replace(RE_BOLD, "$1")
    .replace(RE_ITALIC, "$1")
    .replace(RE_STRIKETHROUGH, "$1")
    .replace(RE_CODE_BLOCK, "")
    .replace(RE_INLINE_CODE, "$1")
    .replace(RE_IMAGE, "$1")
    .replace(RE_LINK, "$1")
    .replace(RE_BLOCKQUOTE, "")
    .replace(RE_UNORDERED_LIST, "")
    .replace(RE_ORDERED_LIST, "")
    .replace(RE_HR, "")
    .replace(RE_MULTI_NEWLINE, " ")
    .replace(RE_MULTI_SPACE, " ")
    .trim();
}

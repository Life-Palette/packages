/**
 * 日期格式化工具（中文相对时间）
 */

const HOUR = 1000 * 60 * 60;
const DAY = HOUR * 24;

/**
 * 把 ISO 字符串转成"X小时前 / X天前"等相对时间
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / HOUR);
  const days = Math.floor(diff / DAY);

  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours}小时前`;
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  if (days < 365) return `${Math.floor(days / 30)}个月前`;
  return `${Math.floor(days / 365)}年前`;
}

/**
 * Date 对象 → "X分钟前 / X小时前 / 昨天"
 * 超过 7 天显示"X月X日"
 */
export function formatDistanceToNow(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / HOUR);
  const days = Math.floor(diff / DAY);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

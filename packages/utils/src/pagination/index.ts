/**
 * 分页工具
 */

/**
 * 生成带省略号的分页页码列表
 *
 * - 总页数 ≤ 5：[1, 2, 3, 4, 5]
 * - 靠近开头：[1, 2, 3, 4, '...', 10]
 * - 中间：[1, '...', 4, 5, 6, '...', 10]
 * - 靠近末尾：[1, '...', 7, 8, 9, 10]
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number
): Array<number | "..."> {
  const maxVisible = 5;
  const result: Array<number | "..."> = [];

  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) {
      result.push(i);
    }
    return result;
  }

  result.push(1);
  if (currentPage <= 3) {
    for (let i = 2; i <= 4; i++) {
      result.push(i);
    }
    result.push("...", totalPages);
  } else if (currentPage >= totalPages - 2) {
    result.push("...");
    for (let i = totalPages - 3; i <= totalPages; i++) {
      result.push(i);
    }
  } else {
    result.push("...");
    for (let i = currentPage - 1; i <= currentPage + 1; i++) {
      result.push(i);
    }
    result.push("...", totalPages);
  }
  return result;
}

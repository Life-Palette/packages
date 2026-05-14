import {
  fileParse,
  isIphoneImg,
  readFile,
  selectFile,
} from "@life-palette/utils";

/**
 * 测试 utils 包集成
 * 验证 monorepo 中包之间的依赖关系
 */
export function testUtilsIntegration() {
  console.log("✅ Test package successfully imported utils package");
  return {
    selectFile,
    readFile,
    fileParse,
    isIphoneImg,
  };
}

// 重新导出所有 utils 功能
export * from "@life-palette/utils";

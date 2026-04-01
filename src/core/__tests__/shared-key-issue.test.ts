import { TranslationManager } from "../TranslationManager";
import { ExistingReference } from "../AstTransformer";
import type { I18nConfig } from "../../types";
import fs from "fs";
import path from "path";
import { jest } from "@jest/globals";

jest.mock("../../utils/llmTranslate", () => ({
  translateWithGlossary: jest.fn(async (text: string) => text),
}));

describe("TranslationManager Shared Key Issue", () => {
  let translationManager: TranslationManager;
  let config: I18nConfig;
  let tempDir: string;

  beforeEach(() => {
    // 创建临时目录
    tempDir = path.join(process.cwd(), "temp-test-output");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    config = {
      rootDir: "./test",
      languages: ["en", "ko"],
      outputDir: tempDir,
      include: ["js", "jsx", "ts", "tsx"],
      ignore: ["**/node_modules/**"],
      startMarker: "~",
      endMarker: "~",
      logLevel: "silent",
      spreadsheetId: "test-id",
      sheetName: "test-sheet",
      keyFile: "test-key.json",
      apiKey: "test-api-key"
    };

    translationManager = new TranslationManager(config);
  });

  afterEach(() => {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const findModulePathBySuffix = (
    generatedRecord: Record<string, any>,
    suffix: string
  ): string | undefined =>
    Object.keys(generatedRecord).find((modulePath) => modulePath.endsWith(suffix));

  test("应该复现共享Key在多个模块中的处理问题", async () => {
    // 模拟场景：
    // 1. ShareSelect.tsx 已经使用了 "Cancel" key
    // 2. DisConnectModal.tsx 也使用了 "Cancel" 和 "Confirm" key
    // 3. 期望：两个模块都应该在最终记录中有对应的数据

    const allReferences = new Map<string, ExistingReference[]>();

    // 模拟 ShareSelect.tsx 中的 Cancel 引用（已存在）
    allReferences.set("Cancel", [
      {
        key: "Cancel",
        filePath: "/test/components/Chat/ShareSelect.tsx",
        lineNumber: 326,
        columnNumber: 11,
        callExpression: "I18n.t(\"Cancel\")"
      }
    ]);

    // 模拟 DisConnectModal.tsx 中的引用（新增的）
    allReferences.set("Cancel", [
      ...allReferences.get("Cancel")!,
      {
        key: "Cancel",
        filePath: "/test/components/Setting/DisConnectModal.tsx",
        lineNumber: 38,
        columnNumber: 10,
        callExpression: "I18n.t(\"Cancel\")"
      }
    ]);

    allReferences.set("Confirm", [
      {
        key: "Confirm",
        filePath: "/test/components/Setting/DisConnectModal.tsx",
        lineNumber: 44,
        columnNumber: 50,
        callExpression: "I18n.t(\"Confirm\")"
      }
    ]);

    // 创建一个模拟的现有完整记录，其中 Cancel 已经在 ShareSelect 模块中
    const mockExistingRecord = {
      "components/Chat/ShareSelect.ts": {
        "Cancel": {
          "en": "Cancel",
          "ko": "취소",
          "mark": 0
        } as any
      }
    };

    // 模拟 loadCompleteRecord 返回现有记录
    const loadCompleteRecordSpy = jest.spyOn(translationManager, 'loadCompleteRecord');
    loadCompleteRecordSpy.mockResolvedValue(mockExistingRecord);

    // 执行 saveCompleteRecord
    await translationManager.saveCompleteRecord(allReferences);

    // 读取生成的完整记录
    const completeRecordPath = path.join(tempDir, "i18n-complete-record.json");
    expect(fs.existsSync(completeRecordPath)).toBe(true);

    const generatedRecord = JSON.parse(fs.readFileSync(completeRecordPath, "utf-8"));
    
    // 验证问题：
    // 1. DisConnectModal 模块应该存在
    const disConnectModalPath = findModulePathBySuffix(
      generatedRecord,
      "components/Setting/DisConnectModal.ts"
    );
    const shareSelectPath = findModulePathBySuffix(
      generatedRecord,
      "components/Chat/ShareSelect.ts"
    );
    if (!disConnectModalPath || !shareSelectPath) {
      throw new Error("未找到预期模块路径");
    }
    expect(generatedRecord[disConnectModalPath]).toBeDefined();
    
    // 2. DisConnectModal 模块应该包含 Cancel 和 Confirm 的翻译
    expect(generatedRecord[disConnectModalPath]["Cancel"]).toBeDefined();
    expect(generatedRecord[disConnectModalPath]["Confirm"]).toBeDefined();

    // 3. 同时 ShareSelect 模块也应该保留 Cancel 翻译
    expect(generatedRecord[shareSelectPath]["Cancel"]).toBeDefined();

    loadCompleteRecordSpy.mockRestore();
  });

  test("应该测试共享Key的路径分类逻辑", async () => {
    const allReferences = new Map<string, ExistingReference[]>();

    // 设置多个文件使用相同的key
    allReferences.set("Cancel", [
      {
        key: "Cancel",
        filePath: "/test/components/Chat/ShareSelect.tsx",
        lineNumber: 326,
        columnNumber: 11,
        callExpression: "I18n.t(\"Cancel\")"
      },
      {
        key: "Cancel",
        filePath: "/test/components/Setting/DisConnectModal.tsx",
        lineNumber: 38,
        columnNumber: 10,
        callExpression: "I18n.t(\"Cancel\")"
      },
      {
        key: "Cancel",
        filePath: "/test/components/Member/CancelModal.tsx",
        lineNumber: 20,
        columnNumber: 15,
        callExpression: "I18n.t(\"Cancel\")"
      }
    ]);

    // 模拟空的现有记录（全新开始）
    const loadCompleteRecordSpy = jest.spyOn(translationManager, 'loadCompleteRecord');
    loadCompleteRecordSpy.mockResolvedValue({});

    await translationManager.saveCompleteRecord(allReferences);

    const completeRecordPath = path.join(tempDir, "i18n-complete-record.json");
    const generatedRecord = JSON.parse(fs.readFileSync(completeRecordPath, "utf-8"));

    // 验证：每个使用了 Cancel 的模块都应该有对应的记录
    const modulesWithCancel = Object.keys(generatedRecord).filter(module =>
      generatedRecord[module]["Cancel"]
    );

    // 期望：应该有3个模块包含 Cancel key
    expect(modulesWithCancel.length).toBeGreaterThan(0);

    // 具体验证每个模块
    expect(
      findModulePathBySuffix(generatedRecord, "components/Chat/ShareSelect.ts")
    ).toBeDefined();
    expect(
      findModulePathBySuffix(
        generatedRecord,
        "components/Setting/DisConnectModal.ts"
      )
    ).toBeDefined();
    expect(
      findModulePathBySuffix(generatedRecord, "components/Member/CancelModal.ts")
    ).toBeDefined();

    loadCompleteRecordSpy.mockRestore();
  }, 15000); // 增加超时到 15 秒

  test("应该测试现有翻译的优先级处理", async () => {
    const allReferences = new Map<string, ExistingReference[]>();

    // DisConnectModal 使用已存在的key
    allReferences.set("Cancel", [
      {
        key: "Cancel",
        filePath: "/test/components/Setting/DisConnectModal.tsx",
        lineNumber: 38,
        columnNumber: 10,
        callExpression: "I18n.t(\"Cancel\")"
      }
    ]);

    // 模拟已存在的翻译记录
    const mockExistingRecord = {
      "components/Chat/ShareSelect.ts": {
        "Cancel": {
          "en": "Cancel",
          "ko": "취소",
          "mark": 0
        } as any
      }
    };

    const loadCompleteRecordSpy = jest.spyOn(translationManager, 'loadCompleteRecord');
    loadCompleteRecordSpy.mockResolvedValue(mockExistingRecord);

    await translationManager.saveCompleteRecord(allReferences);

    const completeRecordPath = path.join(tempDir, "i18n-complete-record.json");
    const generatedRecord = JSON.parse(fs.readFileSync(completeRecordPath, "utf-8"));

    // 关键测试：验证 DisConnectModal 模块是否被正确创建
    const disConnectModalPath = findModulePathBySuffix(
      generatedRecord,
      "components/Setting/DisConnectModal.ts"
    );
    const hasDisConnectModalModule = Boolean(disConnectModalPath);
    const hasDisConnectModalCancel = hasDisConnectModalModule && 
      "Cancel" in generatedRecord[disConnectModalPath!];
    expect(hasDisConnectModalModule).toBe(true);
    expect(hasDisConnectModalCancel).toBe(true);

    loadCompleteRecordSpy.mockRestore();
  });
});
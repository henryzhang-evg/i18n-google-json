// Mock StringUtils to reduce console output during tests and provide required methods
jest.mock("../src/utils/StringUtils", () => ({
  Logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
    setLogLevel: jest.fn(),
  },
  StringUtils: {
    escapeRegex: jest.fn((str: string) =>
      str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ),
    isTranslatableString: jest.fn((value: string, config: any) => {
      // 模拟实际的标记符号检测逻辑
      const { startMarker = "/* I18N_START */", endMarker = "/* I18N_END */" } =
        config || {};
      return (
        value.startsWith(startMarker) &&
        value.endsWith(endMarker) &&
        value.length >= startMarker.length + endMarker.length
      );
    }),
    formatString: jest.fn((value: string, config: any) => {
      // 模拟去除标记符号的逻辑
      const { startMarker = "/* I18N_START */", endMarker = "/* I18N_END */" } =
        config || {};
      return value
        .replace(
          new RegExp(`^${startMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}+`),
          ""
        )
        .replace(
          new RegExp(`${endMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}+$`),
          ""
        );
    }),
    cleanExtractedText: jest.fn((text: string) => {
      return text.replace(/^\s+/, "").replace(/\s+$/, "").replace(/\s+/g, " ");
    }),
    containsEnglishCharacters: jest.fn((text: string) => /[a-zA-Z]/.test(text)),
    generateTranslationKey: jest.fn((filePath: string, text: string) => text),
    generateHashTranslationKey: jest.fn(
      (filePath: string, text: string) => text
    ),
  },
}));

// Mock Google Sheets API
jest.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue({}),
      })),
    },
    sheets: jest.fn().mockImplementation(() => ({
      spreadsheets: {
        values: {
          get: jest.fn().mockResolvedValue({ data: { values: [] } }),
          update: jest.fn().mockResolvedValue({ data: {} }),
        },
      },
    })),
  },
}));

// Mock llmTranslate - always return original text
jest.mock("../src/utils/llmTranslate", () => ({
  llmTranslate: jest
    .fn()
    .mockImplementation((text: string, from: string, to: string) => {
      // 直接返回原文，不做翻译
      return Promise.resolve(text);
    }),
}));

// Mock prompts
const mockPrompt = jest.fn();
jest.mock("prompts", () => mockPrompt);

import * as fs from "fs";
import * as path from "path";
import { I18nScanner } from "../src/core/I18nScanner";
import type { I18nConfig } from "../src/types";

describe("New Translation Only Test", () => {
  jest.setTimeout(30000); // 增加超时时间
  const TEST_ROOT_DIR = "test-src-new-translation";
  const TEST_OUTPUT_DIR = "test-translate-new-translation";
  const testConfig: I18nConfig = {
    rootDir: TEST_ROOT_DIR,
    outputDir: TEST_OUTPUT_DIR,
    include: ["tsx", "ts"],
    ignore: ["node_modules", ".git"],
    languages: ["en", "zh-Hans"],
    apiKey: "test-key",
    spreadsheetId: "test-sheet",
    sheetName: "Sheet1",
    keyFile: "test-key.json",
    startMarker: "/* I18N_START */",
    endMarker: "/* I18N_END */",
    forceKeepKeys: {},
  };

  beforeEach(() => {
    // 清理测试目录 - 使用 try-catch 处理权限问题
    try {
      if (fs.existsSync(TEST_ROOT_DIR)) {
        fs.rmSync(TEST_ROOT_DIR, { recursive: true, force: true, maxRetries: 3 });
      }
    } catch (error) {
      // 忽略清理错误，允许测试继续
      console.warn("Warning: Could not clean test-src directory:", error);
    }

    try {
      if (fs.existsSync(TEST_OUTPUT_DIR)) {
        fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true, maxRetries: 3 });
      }
    } catch (error) {
      // 忽略清理错误，允许测试继续
      console.warn("Warning: Could not clean test-translate directory:", error);
    }

    // 清理所有mock
    jest.clearAllMocks();

    // 默认模拟用户交互：自动跳过所有确认步骤
    mockPrompt.mockImplementation((questions: any) => {
      // 根据提示类型自动响应
      if (Array.isArray(questions)) {
        const responses: any = {};
        questions.forEach((q: any) => {
          if (q.name === "selectionMode") {
            responses[q.name] = "skip";
          } else if (q.name === "confirmSync") {
            responses[q.name] = true;
          } else if (q.name === "confirmRemoteSync") {
            responses[q.name] = true;
          } else if (q.type === "confirm") {
            responses[q.name] = true;
          } else {
            responses[q.name] = "skip";
          }
        });
        return Promise.resolve(responses);
      } else {
        // 单个问题
        if (questions.name === "selectionMode") {
          return Promise.resolve({ selectionMode: "skip" });
        } else if (questions.name === "confirmSync") {
          return Promise.resolve({ confirmSync: true });
        } else if (questions.name === "confirmRemoteSync") {
          return Promise.resolve({ confirmRemoteSync: true });
        } else if (questions.type === "confirm") {
          return Promise.resolve({ [questions.name]: true });
        } else {
          return Promise.resolve({ [questions.name]: "skip" });
        }
      }
    });
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(TEST_ROOT_DIR)) {
      fs.rmSync(TEST_ROOT_DIR, { recursive: true, force: true });
    }
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  test("should correctly extract new translations to complete record - simple case", async () => {
    // 创建包含新翻译的简单文件
    fs.mkdirSync(`${TEST_ROOT_DIR}/components/Simple`, { recursive: true });

    const simpleFileContent = `
import React from "react";

export default function Simple() {
  return (
    <div>
      <div>/* I18N_START */Hello World/* I18N_END */</div>
      <span>/* I18N_START */Test Text/* I18N_END */</span>
    </div>
  );
}
`;

    fs.writeFileSync(`${TEST_ROOT_DIR}/components/Simple/index.tsx`, simpleFileContent);

    // 运行扫描
    const scanner = new I18nScanner(testConfig);
    await scanner.scan();

    // 验证结果
    // 1. 检查转换后的文件
    const transformedContent = fs.readFileSync(
      path.join(process.cwd(), `${TEST_ROOT_DIR}/components/Simple/index.tsx`),
      "utf-8"
    );
    console.log("=== 转换后的文件内容 ===");
    console.log(transformedContent);

    // 2. 检查生成的翻译文件
    const translatePath = `${TEST_OUTPUT_DIR}/components/Simple/index.ts`;
    console.log(`=== 检查翻译文件是否存在: ${translatePath} ===`);
    console.log("存在:", fs.existsSync(translatePath));

    if (fs.existsSync(translatePath)) {
      const translateContent = fs.readFileSync(translatePath, "utf-8");
      console.log("=== 翻译文件内容 ===");
      console.log(translateContent);
    }

    // 3. 检查完整记录
    const completeRecordPath = `${TEST_OUTPUT_DIR}/i18n-complete-record.json`;
    console.log(`=== 检查完整记录文件是否存在: ${completeRecordPath} ===`);
    console.log("存在:", fs.existsSync(completeRecordPath));

    expect(fs.existsSync(completeRecordPath)).toBe(true);
    const completeRecord = JSON.parse(
      fs.readFileSync(completeRecordPath, "utf-8")
    );
    console.log("=== 完整记录内容 ===");
    console.log(JSON.stringify(completeRecord, null, 2));

    // 验证预期结果
    expect(completeRecord["components/Simple/index.ts"]).toBeDefined();
    expect(
      completeRecord["components/Simple/index.ts"]["Hello World"]
    ).toBeDefined();
    expect(
      completeRecord["components/Simple/index.ts"]["Test Text"]
    ).toBeDefined();

    // 验证翻译内容（mock返回原文）
    expect(
      completeRecord["components/Simple/index.ts"]["Hello World"]["en"]
    ).toBe("Hello World");
    expect(
      completeRecord["components/Simple/index.ts"]["Hello World"]["zh-Hans"]
    ).toBe("Hello World");
    expect(
      completeRecord["components/Simple/index.ts"]["Test Text"]["en"]
    ).toBe("Test Text");
    expect(
      completeRecord["components/Simple/index.ts"]["Test Text"]["zh-Hans"]
    ).toBe("Test Text");
  });

  test("should correctly extract new translations - multiple files case", async () => {
    // 创建多个包含新翻译的文件
    fs.mkdirSync(`${TEST_ROOT_DIR}/components/Button`, { recursive: true });
    fs.mkdirSync(`${TEST_ROOT_DIR}/components/Form`, { recursive: true });

    const buttonFileContent = `
import React from "react";

export default function Button() {
  return (
    <button>/* I18N_START */Click Here/* I18N_END */</button>
  );
}
`;

    const formFileContent = `
import React from "react";

export default function Form() {
  return (
    <form>
      <input type="text" placeholder="/* I18N_START */Enter name/* I18N_END */" />
      <button>/* I18N_START */Submit Form/* I18N_END */</button>
    </form>
  );
}
`;

    fs.writeFileSync(`${TEST_ROOT_DIR}/components/Button/index.tsx`, buttonFileContent);
    fs.writeFileSync(`${TEST_ROOT_DIR}/components/Form/index.tsx`, formFileContent);

    // 运行扫描
    const scanner = new I18nScanner(testConfig);
    await scanner.scan();

    // 验证结果
    const completeRecordPath = `${TEST_OUTPUT_DIR}/i18n-complete-record.json`;
    expect(fs.existsSync(completeRecordPath)).toBe(true);

    const completeRecord = JSON.parse(
      fs.readFileSync(completeRecordPath, "utf-8")
    );

    console.log("=== 多文件完整记录内容 ===");
    console.log(JSON.stringify(completeRecord, null, 2));

    // 验证Button组件的翻译（mock返回原文）
    expect(completeRecord["components/Button/index.ts"]).toBeDefined();
    expect(
      completeRecord["components/Button/index.ts"]["Click Here"]
    ).toBeDefined();
    expect(
      completeRecord["components/Button/index.ts"]["Click Here"]["en"]
    ).toBe("Click Here");
    expect(
      completeRecord["components/Button/index.ts"]["Click Here"]["zh-Hans"]
    ).toBe("Click Here");

    // 验证Form组件的翻译（mock返回原文）
    expect(completeRecord["components/Form/index.ts"]).toBeDefined();
    expect(
      completeRecord["components/Form/index.ts"]["Submit Form"]
    ).toBeDefined();
    expect(
      completeRecord["components/Form/index.ts"]["Submit Form"]["en"]
    ).toBe("Submit Form");
    expect(
      completeRecord["components/Form/index.ts"]["Submit Form"]["zh-Hans"]
    ).toBe("Submit Form");
  });

  test("should verify file transformation and import addition", async () => {
    // 测试文件转换是否正确添加了导入语句和I18n调用
    fs.mkdirSync(`${TEST_ROOT_DIR}/components/Test`, { recursive: true });

    const testFileContent = `
import React from "react";

export default function Test() {
  return (
    <div>
      <h1>/* I18N_START */Welcome/* I18N_END */</h1>
      <p>/* I18N_START */This is a test/* I18N_END */</p>
    </div>
  );
}
`;

    fs.writeFileSync(`${TEST_ROOT_DIR}/components/Test/index.tsx`, testFileContent);

    // 运行扫描
    const scanner = new I18nScanner(testConfig);
    await scanner.scan();

    // 检查转换后的文件
    const transformedContent = fs.readFileSync(
      `${TEST_ROOT_DIR}/components/Test/index.tsx`,
      "utf-8"
    );

    console.log("=== 转换验证 - 原始内容 ===");
    console.log(testFileContent);
    console.log("=== 转换验证 - 转换后内容 ===");
    console.log(transformedContent);

    // 验证是否添加了必要的导入
    expect(transformedContent).toContain("import { I18nUtil }");
    expect(transformedContent).toContain("import Translations from");
    expect(transformedContent).toContain("@translate/components/Test/index");

    // 验证是否正确转换了文本
    expect(transformedContent).toContain('I18n.t("Welcome")');
    expect(transformedContent).toContain('I18n.t("This is a test")');
  });
});

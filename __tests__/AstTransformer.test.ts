// Mock Logger to keep output clean
jest.mock("../src/utils/StringUtils", () => ({
  Logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    setLogLevel: jest.fn(),
  },
  StringUtils: jest.requireActual("../src/utils/StringUtils").StringUtils,
}));

import path from "path";
import { AstTransformer } from "../src/core/AstTransformer";
import type { I18nConfig } from "../src/types";

const rootDir = path.join(process.cwd(), "proj", "src");
const abs = (p: string) => path.join(rootDir, p);

const baseConfig: I18nConfig = {
  rootDir,
  outputDir: path.join(process.cwd(), "test-translate"),
  include: ["ts", "tsx"],
  ignore: [],
  languages: ["en", "zh-Hans"],
  apiKey: "test",
  spreadsheetId: "sheet",
  sheetName: "Sheet1",
  keyFile: "key.json",
  startMarker: "/* I18N_START */",
  endMarker: "/* I18N_END */",
  forceKeepKeys: {},
};

describe("AstTransformer", () => {
  test("transformSource: 标记的字符串与模板、JSX文本均被转换并注入导入", () => {
    const transformer = new AstTransformer(baseConfig);
    const filePath = abs("components/Simple/index.tsx");
    const source = `
      import React from "react";
      export default function Simple({name}:{name:string}) {
        const already = I18n.t("Kept");
        return (
          <div>
            <div>/* I18N_START */Hello/* I18N_END */</div>
            <span>{\`/* I18N_START */Hi \${name}/* I18N_END */\`}</span>
            <p>Pure English Text</p>
          </div>
        );
      }
    `;

    const { results, transformedCode } = transformer.transformSource(
      source,
      filePath
    );

    // 至少包含3条新翻译（标记字面量、标记模板、JSX文本）
    expect(results.length).toBeGreaterThanOrEqual(3);

    // 导入添加
    expect(transformedCode).toContain(
      'import Translations from "@translate/components/Simple/index"'
    );
    expect(transformedCode).toContain('import { I18nUtil } from "@utils/i18n"');
    expect(transformedCode).toContain(
      "const I18n = I18nUtil.createScoped(Translations)"
    );

    // I18n.t 调用存在
    expect(transformedCode).toContain('I18n.t("Hello")');
    expect(transformedCode).toContain('I18n.t("Pure English Text")');
  });

  test("collectExistingI18nCalls: 收集字符串与模板字面量的 key", () => {
    const transformer = new AstTransformer(baseConfig);
    const filePath = abs("components/A.tsx");
    const source =
      `
      const a = I18n.t("KeyA");
      const b = I18n.t(` +
      "`KeyB`" +
      `);
      const c = I18n.t("KeyC", {x:1});
      const not = console.log("KeyA");
    `;
    const refs = transformer.collectExistingI18nCalls(source, filePath);
    const keys = refs.map((r) => r.key).sort();
    expect(keys).toEqual(["KeyA", "KeyB", "KeyC"].sort());
    // 位置信息应存在
    refs.forEach((r) => {
      expect(typeof r.lineNumber).toBe("number");
      expect(typeof r.columnNumber).toBe("number");
    });
  });

  test("analyzeAndTransformSource: 有新翻译时会对转换后代码进行二次收集", () => {
    const transformer = new AstTransformer(baseConfig);
    const filePath = abs("components/B.tsx");
    const source = `
      import React from "react";
      export default function B(){
        return <div>/* I18N_START */Welcome/* I18N_END */</div>;
      }
    `;
    const result = transformer.analyzeAndTransformSource(source, filePath);
    expect(result.newTranslations.length).toBe(1);
    // 二次收集后的 existingReferences 至少包含我们刚刚插入的 I18n.t
    expect(result.existingReferences.length).toBeGreaterThanOrEqual(1);
    expect(result.transformedCode).toContain('I18n.t("Welcome")');
  });

  test("analyzeAndTransformSource: 没有新翻译时修复错误的 @translate 导入路径", () => {
    const transformer = new AstTransformer(baseConfig);
    const filePath = abs("components/Header/index.tsx");
    const source = `
      import Translations from "@translate/components/Wrong/index";
      import { I18nUtil } from "@utils/i18n";
      const I18n = I18nUtil.createScoped(Translations);
      export default function H(){
        return <h1>{I18n.t("Title")}</h1>;
      }
    `;
    const result = transformer.analyzeAndTransformSource(source, filePath);
    // 无新翻译
    expect(result.newTranslations.length).toBe(0);
    // 修复为正确路径
    expect(result.transformedCode).toContain(
      'import Translations from "@translate/components/Header/index"'
    );
    expect(result.transformedCode).not.toContain(
      'import Translations from "@translate/components/Wrong/index"'
    );
  });

  describe("跨JSX元素标记提取", () => {
    // 使用JSX兼容的配置（使用 ~ 作为标记符号）
    const jsxConfig: I18nConfig = {
      ...baseConfig,
      startMarker: "~",
      endMarker: "~",
    };

    test("基本跨元素: ~<div>a</div><span>b</span>~", () => {
      const transformer = new AstTransformer(jsxConfig);
      const filePath = abs("components/CrossElement.tsx");
      const source = `
        import React from "react";
        export default function CrossElement() {
          return (
            <div>
              ~<div>sdssdd</div>
              <span>sdsdsffff</span>~
            </div>
          );
        }
      `;
      const { results, transformedCode } = transformer.transformSource(source, filePath);

      // 应该生成1个翻译（整体作为一个单元）
      expect(results.length).toBe(1);

      // 翻译文本应包含元素占位符
      const translationText = results[0].text;
      expect(translationText).toContain("<el0>");
      expect(translationText).toContain("<el1>");

      // 转换后的代码应包含I18n.t调用，带有元素选项
      expect(transformedCode).toContain("I18n.t(");
      expect(transformedCode).toContain("el0:");
      expect(transformedCode).toContain("el1:");

      // 不应该留下标记符号
      expect(transformedCode).not.toContain("~");
    });

    test("相邻元素无文本分隔: ~<strong>warranty</strong><strong>dd</strong>~", () => {
      const transformer = new AstTransformer(jsxConfig);
      const filePath = abs("components/Adjacent.tsx");
      const source = `
        import React from "react";
        export default function Adjacent() {
          return (
            <div>
              ~<strong>warranty</strong><strong>dd</strong>~
            </div>
          );
        }
      `;
      const { results, transformedCode } = transformer.transformSource(source, filePath);

      // 应该生成1个翻译
      expect(results.length).toBe(1);

      // 翻译文本应包含两个元素占位符
      const translationText = results[0].text;
      expect(translationText).toContain("<el0>");
      expect(translationText).toContain("<el1>");

      // 转换后的代码应包含I18n.t调用
      expect(transformedCode).toContain("I18n.t(");
      expect(transformedCode).toContain("el0:");
      expect(transformedCode).toContain("el1:");
    });

    test("混合文本与元素: ~Text <strong>bold</strong> more~", () => {
      const transformer = new AstTransformer(jsxConfig);
      const filePath = abs("components/MixedText.tsx");
      const source = `
        import React from "react";
        export default function MixedText() {
          return (
            <div>
              ~Text <strong>bold</strong> more~
            </div>
          );
        }
      `;
      const { results, transformedCode } = transformer.transformSource(source, filePath);

      // 应该生成1个翻译
      expect(results.length).toBe(1);

      // 翻译文本应包含文本和元素占位符
      const translationText = results[0].text;
      expect(translationText).toContain("Text");
      expect(translationText).toContain("<el0>");
      expect(translationText).toContain("more");

      // 转换后的代码应包含I18n.t调用
      expect(transformedCode).toContain("I18n.t(");
      expect(transformedCode).toContain("el0:");
    });

    test("嵌套标记在外层元素: 内外层都被处理", () => {
      const transformer = new AstTransformer(jsxConfig);
      const filePath = abs("components/NestedMarker.tsx");
      const source = `
        import React from "react";
        export default function NestedMarker() {
          return (
            <div>
              ~<div>~inner~</div>~
            </div>
          );
        }
      `;
      const { results, transformedCode } = transformer.transformSource(source, filePath);

      // 内层和外层都有标记，应该生成2个翻译
      // 1. 内层: ~inner~ -> "inner"
      // 2. 外层: ~<div>...</div>~ -> 包含元素占位符的翻译
      expect(results.length).toBe(2);

      // 检查是否包含内层文本翻译
      const hasInnerTranslation = results.some(r => r.text === "inner");
      expect(hasInnerTranslation).toBe(true);

      // 检查是否包含外层元素翻译
      const hasOuterTranslation = results.some(r => r.text.includes("<el0>"));
      expect(hasOuterTranslation).toBe(true);

      // 转换后的代码应包含I18n.t调用
      expect(transformedCode).toContain("I18n.t(");
    });

    test("标记跨多层嵌套: ~<div><div>a</div><span>b</span></div>~", () => {
      const transformer = new AstTransformer(jsxConfig);
      const filePath = abs("components/DeepNested.tsx");
      const source = `
        import React from "react";
        export default function DeepNested() {
          return (
            <section>
              ~<div><div>sdssdd</div><span>sdsdsffff</span></div>~
            </section>
          );
        }
      `;
      const { results, transformedCode } = transformer.transformSource(source, filePath);

      // 应该生成1个翻译（外层整体）
      expect(results.length).toBe(1);

      // 翻译文本应包含元素占位符
      const translationText = results[0].text;
      expect(translationText).toContain("<el0>");

      // 转换后的代码应包含I18n.t调用
      expect(transformedCode).toContain("I18n.t(");
      expect(transformedCode).toContain("el0:");
    });
  });
});

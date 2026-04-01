import { AstTransformer } from "../AstTransformer";
import type { I18nConfig } from "../../types";

const baseConfig: I18nConfig = {
  rootDir: "./",
  languages: ["en", "zh-CN"],
  include: ["js", "jsx", "ts", "tsx"],
  ignore: [],
  outputDir: "./src/translate",
  startMarker: "~",
  endMarker: "~",
  logLevel: "silent",
  spreadsheetId: "test",
  sheetName: "test",
  keyFile: "test.json",
  apiKey: "test",
};

describe("AstTransformer - translation call strategy", () => {
  test("tsx 组件内使用 useTranslation + t(key)", () => {
    const transformer = new AstTransformer({
      ...baseConfig,
      translationCallStrategy: {
        component: {
          enabled: true,
          hookName: "useTranslation",
          hookImportFrom: "react-i18next",
          translatorName: "t",
        },
        module: {},
      },
    });

    const source = `
      function Header() {
        return <h1>Hello World</h1>;
      }
    `;

    const result = transformer.transformSource(source, "Header.tsx");
    expect(result.results).toHaveLength(1);
    expect(result.transformedCode).toContain('import { useTranslation } from "react-i18next"');
    expect(result.transformedCode).toContain("useTranslation()");
    expect(result.transformedCode).toContain('{t("Hello World")}');
  });

  test("普通 ts 模块固定使用 i18n.t 调用", () => {
    const transformer = new AstTransformer({
      ...baseConfig,
      translationCallStrategy: {
        component: {
          enabled: true,
          hookName: "useTranslation",
          hookImportFrom: "react-i18next",
          translatorName: "t",
        },
        module: {},
      },
    });

    const source = `
      export function createMessage() {
        const value = "~Welcome~";
        return value;
      }
    `;

    const result = transformer.transformSource(source, "message.ts");
    expect(result.results).toHaveLength(1);
    expect(result.transformedCode).toContain('import i18n from "@i18n"');
    expect(result.transformedCode).toContain('const value = i18n.t("Welcome");');
    expect(result.transformedCode).not.toContain("useTranslation");
  });

  test("组件内已存在 const { t } = useTranslation() 时不重复注入", () => {
    const transformer = new AstTransformer({
      ...baseConfig,
      translationCallStrategy: {
        component: {
          enabled: true,
          hookName: "useTranslation",
          hookImportFrom: "react-i18next",
          translatorName: "t",
        },
        module: {},
      },
    });

    const source = `
      import { useTranslation } from "react-i18next";
      function Header() {
        const { t } = useTranslation();
        return <h1>Hello World</h1>;
      }
    `;

    const result = transformer.transformSource(source, "Header.tsx");
    expect(result.results).toHaveLength(1);
    // TSX 解析为 ObjectProperty，旧逻辑未识别会导致重复 const { t } 与 SyntaxError
    const useTranslationCalls = (
      result.transformedCode.match(/useTranslation\s*\(/g) || []
    ).length;
    expect(useTranslationCalls).toBe(1);
    expect(result.transformedCode).toContain('{t("Hello World")}');
  });

  test("若 t() 使用在前且 useTranslation 在后，应上提到顶部并移除下方声明", () => {
    const transformer = new AstTransformer({
      ...baseConfig,
      translationCallStrategy: {
        component: {
          enabled: true,
          hookName: "useTranslation",
          hookImportFrom: "react-i18next",
          translatorName: "t",
        },
        module: {},
      },
    });

    const source = `
      import { useTranslation } from "react-i18next";
      function Header() {
        const options = ["~AI & Tech~"];
        return <h1>{options.map((x) => t(x)).join(", ")}</h1>;
        const { t } = useTranslation();
      }
    `;

    const result = transformer.transformSource(source, "Header.tsx");
    const useTranslationCalls =
      (result.transformedCode.match(/useTranslation\s*\(/g) || []).length;
    expect(useTranslationCalls).toBe(1);
    expect(result.transformedCode).toContain("const {");
    expect(result.transformedCode).toContain("} = useTranslation()");
  });

  test("tsx 已有 useTranslation 但不在顶部时也会自动上提", () => {
    const transformer = new AstTransformer({
      ...baseConfig,
      translationCallStrategy: {
        component: {
          enabled: true,
          hookName: "useTranslation",
          hookImportFrom: "react-i18next",
          translatorName: "t",
        },
        module: {},
      },
    });

    const source = `
      import { useTranslation } from "react-i18next";
      function Header() {
        const title = t("existing_key");
        const { t } = useTranslation();
        return <h1>{title}</h1>;
      }
    `;

    const result = transformer.analyzeAndTransformSource(source, "Header.tsx");
    const useTranslationCalls =
      (result.transformedCode.match(/useTranslation\s*\(/g) || []).length;
    expect(useTranslationCalls).toBe(1);
    const idxInit = result.transformedCode.indexOf("useTranslation()");
    const idxTitle = result.transformedCode.indexOf('t("existing_key")');
    expect(idxInit).toBeGreaterThanOrEqual(0);
    expect(idxTitle).toBeGreaterThanOrEqual(0);
    expect(idxInit).toBeLessThan(idxTitle);
  });

  test("namespace 模式：tsx 注入 useTranslation(namespace) + 短 key", () => {
    const transformer = new AstTransformer({
      ...baseConfig,
      translationCallStrategy: {
        component: {
          enabled: true,
          hookName: "useTranslation",
          hookImportFrom: "react-i18next",
          translatorName: "t",
        },
        module: {},
        namespace: {
          enabled: true,
          shortKey: true,
        },
      },
    });
    const source = `
      function Step2MarketsTopicsScreen() {
        return <h1>AI & Tech</h1>;
      }
    `;
    const result = transformer.transformSource(
      source,
      "onboarding/screens/Step2MarketsTopicsScreen.tsx"
    );
    expect(result.transformedCode).toContain(
      'useTranslation("onboarding.screens.Step2MarketsTopicsScreen")'
    );
    expect(result.transformedCode).toContain('t("AI_Tech")');
  });

  test("namespace 模式：模块分支使用 i18n.t(shortKey, { ns })", () => {
    const transformer = new AstTransformer({
      ...baseConfig,
      translationCallStrategy: {
        component: {
          enabled: true,
          hookName: "useTranslation",
          hookImportFrom: "react-i18next",
          translatorName: "t",
        },
        module: {},
        namespace: {
          enabled: true,
          shortKey: true,
        },
      },
    });
    const source = `
      export const TOPIC_OPTIONS = ["~AI & Tech~"];
    `;
    const result = transformer.transformSource(
      source,
      "onboarding/screens/Step2MarketsTopicsScreen.ts"
    );
    expect(result.transformedCode).toContain('i18n.t("AI_Tech"');
    expect(result.transformedCode).toContain(
      'ns: "onboarding.screens.Step2MarketsTopicsScreen"'
    );
  });
});

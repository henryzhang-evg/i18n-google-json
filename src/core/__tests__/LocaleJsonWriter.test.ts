import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PathUtils } from "../../utils/PathUtils";
import {
  buildLocaleMapsPerLanguage,
  writeFlatLocaleJsonFiles,
} from "../LocaleJsonWriter";
import type { CompleteTranslationRecord } from "../TranslationManager";

describe("LocaleJsonWriter / PathUtils locale namespace", () => {
  test("modulePathToLocaleNamespace", () => {
    expect(PathUtils.modulePathToLocaleNamespace("components/Header.ts")).toBe(
      "components.Header"
    );
    expect(PathUtils.modulePathToLocaleNamespace("pages/home.ts")).toBe(
      "pages.home"
    );
    expect(PathUtils.modulePathToLocaleNamespace("TestModular.ts")).toBe(
      "TestModular"
    );
  });

  test("raw 模式：key 与代码中的 t(key) 一致", () => {
    const record: CompleteTranslationRecord = {
      "components/Header.ts": {
        Welcome: { en: "Welcome", "zh-CN": "欢迎" },
      },
    };
    const maps = buildLocaleMapsPerLanguage(record, ["en", "zh-CN"], "raw");
    expect(maps.en["Welcome"]).toBe("Welcome");
    expect(maps["zh-CN"]["Welcome"]).toBe("欢迎");
  });

  test("namespaced 模式：按 namespace 嵌套对象", () => {
    const record: CompleteTranslationRecord = {
      "onboarding/screens/Step2MarketsTopicsScreen.ts": {
        AI_Tech: { en: "AI & Tech" },
      },
    };
    const maps = buildLocaleMapsPerLanguage(record, ["en"], "namespaced");
    expect(
      maps.en["onboarding.screens.Step2MarketsTopicsScreen"]["AI_Tech"]
    ).toBe("AI & Tech");
  });

  test("writeFlatLocaleJsonFiles 写入 JSON 文件", async () => {
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "locales-"));
    const record: CompleteTranslationRecord = {
      "components/Header.ts": {
        Welcome: { en: "Welcome" },
      },
    };
    const localeDir = path.join(tmp, "locals");
    await writeFlatLocaleJsonFiles(localeDir, record, ["en"], "raw");
    const content = await fs.promises.readFile(
      path.join(localeDir, "en.json"),
      "utf-8"
    );
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({ Welcome: "Welcome" });
    const index = await fs.promises.readFile(
      path.join(localeDir, "index.ts"),
      "utf-8"
    );
    expect(index).toContain("export const I18N_GOOGLE_RESOURCES");
    expect(index).toContain('"en": locale_en');
  });

  test("writeFlatLocaleJsonFiles namespaced 模式写入嵌套 JSON", async () => {
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "locales-"));
    const record: CompleteTranslationRecord = {
      "onboarding/screens/Step2MarketsTopicsScreen.ts": {
        AI_Tech: { en: "AI & Tech" },
      },
    };
    const localeDir = path.join(tmp, "locals");
    await writeFlatLocaleJsonFiles(localeDir, record, ["en"], "namespaced");
    const content = await fs.promises.readFile(
      path.join(localeDir, "en.json"),
      "utf-8"
    );
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({
      "onboarding.screens.Step2MarketsTopicsScreen": {
        AI_Tech: "AI & Tech",
      },
    });
    const index = await fs.promises.readFile(
      path.join(localeDir, "index.ts"),
      "utf-8"
    );
    expect(index).toContain("export const I18N_GOOGLE_NAMESPACES");
    expect(index).toContain(
      '"onboarding.screens.Step2MarketsTopicsScreen"'
    );
  });

  test("index.ts 支持带连字符语言代码导入变量", async () => {
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "locales-"));
    const record: CompleteTranslationRecord = {
      "pages/home.ts": {
        Welcome: { en: "Welcome", "zh-CN": "欢迎" },
      },
    };
    const localeDir = path.join(tmp, "locals");
    await writeFlatLocaleJsonFiles(localeDir, record, ["en", "zh-CN"], "raw");
    const index = await fs.promises.readFile(
      path.join(localeDir, "index.ts"),
      "utf-8"
    );
    expect(index).toContain("import locale_zh_CN from './zh-CN.json';");
    expect(index).toContain('"zh-CN": locale_zh_CN');
  });
});

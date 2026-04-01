import fs from "fs";
import os from "os";
import path from "path";
import { TranslationManager } from "../TranslationManager";
import type { I18nConfig } from "../../types";

describe("TranslationManager output toggles", () => {
  test("generateModuleFiles=false 时不生成 outputDir 下模块化 ts 文件", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-output-"));
    const outputDir = path.join(tmpDir, "translate");
    const localsDir = path.join(tmpDir, "locals");
    fs.mkdirSync(outputDir, { recursive: true });

    const completeRecord = {
      "components/Header.ts": {
        Welcome: {
          en: "Welcome",
          "zh-CN": "欢迎",
        },
      },
    };
    fs.writeFileSync(
      path.join(outputDir, "i18n-complete-record.json"),
      JSON.stringify(completeRecord, null, 2),
      "utf-8"
    );

    const config: I18nConfig = {
      rootDir: "./src",
      languages: ["en", "zh-CN"],
      ignore: [],
      spreadsheetId: "test",
      sheetName: "test",
      keyFile: "test.json",
      startMarker: "~",
      endMarker: "~",
      include: ["ts", "tsx", "js", "jsx"],
      outputDir,
      apiKey: "test",
      generateModuleFiles: false,
      localeJson: true,
      localeJsonDir: localsDir,
    };

    const manager = new TranslationManager(config);
    await manager.generateModularFilesFromCompleteRecord();

    expect(fs.existsSync(path.join(outputDir, "components", "Header.ts"))).toBe(
      false
    );
    expect(fs.existsSync(path.join(localsDir, "en.json"))).toBe(true);
  });
});

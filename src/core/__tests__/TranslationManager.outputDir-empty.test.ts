import fs from "fs";
import os from "os";
import path from "path";
import { TranslationManager } from "../TranslationManager";
import type { I18nConfig } from "../../types";

describe("TranslationManager outputDir empty string", () => {
  test("outputDir 为空字符串时不应因 mkdir('') 报错", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-empty-out-"));
    const prev = process.cwd();
    process.chdir(tmpDir);
    try {
      const config: I18nConfig = {
        rootDir: "./src",
        languages: ["en"],
        ignore: [],
        spreadsheetId: "test",
        sheetName: "test",
        keyFile: "test.json",
        startMarker: "~",
        endMarker: "~",
        include: ["ts", "tsx", "js", "jsx"],
        outputDir: "",
        apiKey: "test",
        generateModuleFiles: false,
        localeJson: false,
      };

      const manager = new TranslationManager(config);
      await manager.saveCompleteRecord(new Map());

      expect(fs.existsSync(path.join(tmpDir, "i18n-complete-record.json"))).toBe(
        true
      );
    } finally {
      process.chdir(prev);
    }
  });
});

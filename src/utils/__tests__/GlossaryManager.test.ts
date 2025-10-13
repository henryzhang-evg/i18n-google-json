// Mock GoogleSheetsClient - must be before imports
const mockIsReady = jest.fn();
const mockReadSheet = jest.fn();

jest.mock("../GoogleSheetsClient", () => ({
  GoogleSheetsClient: jest.fn().mockImplementation(() => ({
    isReady: mockIsReady,
    readSheet: mockReadSheet,
  })),
}));

import { GlossaryManager } from "../GlossaryManager";
import type { I18nConfig } from "../../types";

describe("GlossaryManager", () => {
  let glossaryManager: GlossaryManager;
  let config: I18nConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      rootDir: "./test",
      ignore: ["**/node_modules/**"],
      spreadsheetId: "test-spreadsheet-id",
      sheetName: "i18n",
      keyFile: "test-key-file.json",
      glossarySpreadsheetId: "test-glossary-id",
      glossarySheetName: "terms",
      languages: ["en", "zh", "es", "ko", "vi", "tr", "fr"],
      include: ["ts", "tsx", "js", "jsx"],
      outputDir: "./test-output",
      startMarker: "~",
      endMarker: "~",
      apiKey: "test-api-key"
    };

    // Default mock setup - GoogleSheets client is ready
    mockIsReady.mockReturnValue(true);
    mockReadSheet.mockResolvedValue({
      headers: [],
      values: [],
    });

    glossaryManager = new GlossaryManager(config);
  });

  describe("Glossary Loading", () => {
    it("should load glossary from Google Sheets successfully", async () => {
      mockReadSheet.mockResolvedValueOnce({
        headers: ["en", "zh", "es", "ko", "vi", "tr", "fr"],
        values: [
          ["en", "zh", "es", "ko", "vi", "tr", "fr"], // header row
          ["Hello", "你好", "Hola", "안녕하세요", "Xin chào", "Merhaba", "Bonjour"],
          ["Login", "登录", "Iniciar sesión", "로그인", "Đăng nhập", "Giriş yap", "Se connecter"],
        ],
      });

      const glossary = await glossaryManager.loadGlossary();

      expect(mockReadSheet).toHaveBeenCalled();

      // Verify glossary structure
      expect(glossary.zh).toEqual({
        "Hello": "你好",
        "Login": "登录",
      });
      expect(glossary.es).toEqual({
        "Hello": "Hola",
        "Login": "Iniciar sesión",
      });
    });

    it("should handle empty glossary gracefully", async () => {
      mockReadSheet.mockResolvedValueOnce({
        headers: ["en", "zh"],
        values: [["en", "zh"]], // Only header, no data
      });

      const glossary = await glossaryManager.loadGlossary();

      expect(glossary).toEqual({
        zh: {},
        es: {},
        ko: {},
        vi: {},
        tr: {},
        fr: {},
      });
    });

    it("should handle Google Sheets load errors", async () => {
      mockReadSheet.mockRejectedValueOnce(new Error("Load failed"));

      const glossary = await glossaryManager.loadGlossary();

      expect(glossary).toEqual({
        zh: {},
        es: {},
        ko: {},
        vi: {},
        tr: {},
        fr: {},
      });
    });

    it("should handle missing sheet errors", async () => {
      mockIsReady.mockReturnValue(false);

      const glossary = await glossaryManager.loadGlossary();

      expect(glossary).toEqual({
        zh: {},
        es: {},
        ko: {},
        vi: {},
        tr: {},
        fr: {},
      });
    });

    it("should skip empty terms and translations", async () => {
      mockReadSheet.mockResolvedValueOnce({
        headers: ["en", "zh", "es", "ko"],
        values: [
          ["en", "zh", "es", "ko"], // header row
          ["Hello", "你好", "", "안녕하세요"], // Empty es translation
          ["", "测试", "Prueba", ""], // Empty en term
          ["Valid", "有效", "Válido", ""],
        ],
      });

      const glossary = await glossaryManager.loadGlossary();

      // Should only include valid entries
      expect(glossary.zh).toEqual({
        "Hello": "你好",
        "Valid": "有效",
      });
      expect(glossary.es).toEqual({
        "Valid": "Válido",
      });
    });
  });

  // Note: applyGlossary method has been deprecated
  // New glossary logic is in llmTranslate.ts - translateWithGlossary function
  // Tests for the new logic are in llmTranslate.test.ts

  describe("Glossary Caching", () => {
    it("should cache loaded glossary and not reload on subsequent calls", async () => {
      mockReadSheet.mockResolvedValueOnce({
        headers: ["en", "zh"],
        values: [
          ["en", "zh"],
          ["Test", "测试"],
        ],
      });

      // First load
      const glossary1 = await glossaryManager.loadGlossary();
      // Second load (should use cache)
      const glossary2 = await glossaryManager.loadGlossary();

      expect(mockReadSheet).toHaveBeenCalledTimes(1); // Should only call once
      expect(glossary1).toEqual(glossary2);
    });

    it("should force reload when requested", async () => {
      mockReadSheet
        .mockResolvedValueOnce({
          headers: ["en", "zh"],
          values: [
            ["en", "zh"],
            ["Test1", "测试1"],
          ],
        })
        .mockResolvedValueOnce({
          headers: ["en", "zh"],
          values: [
            ["en", "zh"],
            ["Test2", "测试2"],
          ],
        });

      // First load
      const glossary1 = await glossaryManager.loadGlossary();
      // Force reload
      const glossary2 = await glossaryManager.loadGlossary(true);

      expect(mockReadSheet).toHaveBeenCalledTimes(2);
      expect(glossary1.zh).toEqual({ "Test1": "测试1" });
      expect(glossary2.zh).toEqual({ "Test2": "测试2" });
    });
  });

  describe("Error Recovery", () => {
    it("should return empty glossary on network errors", async () => {
      mockReadSheet.mockRejectedValueOnce(new Error("Network error"));

      const glossary = await glossaryManager.loadGlossary();

      // Should return empty glossary instead of throwing
      expect(glossary).toEqual({
        zh: {},
        es: {},
        ko: {},
        vi: {},
        tr: {},
        fr: {},
      });
    });

    it("should log warnings on glossary load failures", async () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      mockReadSheet.mockRejectedValueOnce(new Error("Load failed"));

      await glossaryManager.loadGlossary();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("📚 [术语表]")
      );

      consoleSpy.mockRestore();
    });
  });
});
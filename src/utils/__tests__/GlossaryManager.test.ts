import { GlossaryManager } from "../GlossaryManager";
import { GoogleSpreadsheet } from "google-spreadsheet";
import type { I18nConfig } from "../../types";

// Mock Google Sheets
jest.mock("google-spreadsheet");
const MockedGoogleSpreadsheet = GoogleSpreadsheet as jest.MockedClass<typeof GoogleSpreadsheet>;

describe("GlossaryManager", () => {
  let mockDoc: jest.Mocked<GoogleSpreadsheet>;
  let mockSheet: any;
  let glossaryManager: GlossaryManager;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSheet = {
      getRows: jest.fn(),
      loadHeaderRow: jest.fn(),
    };
    
    mockDoc = {
      loadInfo: jest.fn(),
      sheetsByIndex: [mockSheet],
      get sheetsByTitle() { return { "terms": mockSheet }; },
    } as any;

    MockedGoogleSpreadsheet.mockImplementation(() => mockDoc);

    const config: I18nConfig = {
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

    glossaryManager = new GlossaryManager(config);
  });

  describe("Glossary Loading", () => {
    it("should load glossary from Google Sheets successfully", async () => {
      const mockRows = [
        {
          en: "Hello",
          zh: "你好",
          es: "Hola",
          ko: "안녕하세요",
          vi: "Xin chào",
          tr: "Merhaba",
          fr: "Bonjour",
        },
        {
          en: "Login",
          zh: "登录",
          es: "Iniciar sesión",
          ko: "로그인",
          vi: "Đăng nhập",
          tr: "Giriş yap",
          fr: "Se connecter",
        },
      ];

      mockSheet.getRows.mockResolvedValueOnce(mockRows);

      const glossary = await glossaryManager.loadGlossary();

      expect(mockDoc.loadInfo).toHaveBeenCalled();
      expect(mockSheet.getRows).toHaveBeenCalled();

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
      mockSheet.getRows.mockResolvedValueOnce([]);

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
      mockDoc.loadInfo.mockRejectedValueOnce(new Error("Load failed"));

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
      // Mock document with no sheets  
      const emptyMockDoc = {
        loadInfo: jest.fn().mockResolvedValueOnce(undefined),
        get sheetsByTitle() { return {}; },
      } as any;
      MockedGoogleSpreadsheet.mockImplementationOnce(() => emptyMockDoc);

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
      const mockRows = [
        {
          en: "Hello",
          zh: "你好",
          es: "", // Empty translation
          ko: "안녕하세요",
        },
        {
          en: "", // Empty term
          zh: "测试",
          es: "Prueba",
        },
        {
          en: "Valid",
          zh: "有效",
          es: "Válido",
        },
      ];

      mockSheet.getRows.mockResolvedValueOnce(mockRows);

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

  describe("Term Replacement Logic", () => {
    let glossary: any;

    beforeEach(() => {
      glossary = {
        zh: {
          "Hello": "你好",
          "World": "世界",
          "Hello World": "你好世界",
          "API": "接口",
          "user interface": "用户界面",
        },
        es: {
          "Hello": "Hola",
          "World": "Mundo",
          "Hello World": "Hola Mundo",
          "API": "API",
          "user interface": "interfaz de usuario",
        },
      };
    });

    it("should apply simple term replacements", () => {
      const result = glossaryManager.applyGlossary("Hello", "zh", glossary);
      expect(result).toBe("你好");
    });

    it("should handle case-insensitive matching", () => {
      const result = glossaryManager.applyGlossary("hello", "zh", glossary);
      expect(result).toBe("你好");
    });

    it("should prioritize longer matches over shorter ones", () => {
      const result = glossaryManager.applyGlossary("Hello World", "zh", glossary);
      expect(result).toBe("你好世界"); // Should match full phrase, not "Hello" + "World"
    });

    it("should handle partial matches in longer text", () => {
      const result = glossaryManager.applyGlossary("The Hello World API", "zh", glossary);
      expect(result).toBe("The 你好世界 接口");
    });

    it("should handle multiple term replacements", () => {
      const result = glossaryManager.applyGlossary("Hello API World", "zh", glossary);
      expect(result).toBe("你好 接口 世界");
    });

    it("should return original text when no terms match", () => {
      const result = glossaryManager.applyGlossary("No matches here", "zh", glossary);
      expect(result).toBe("No matches here");
    });

    it("should handle empty glossary", () => {
      const result = glossaryManager.applyGlossary("Hello", "zh", { zh: {} });
      expect(result).toBe("Hello");
    });

    it("should handle missing language in glossary", () => {
      const result = glossaryManager.applyGlossary("Hello", "unknown", glossary);
      expect(result).toBe("Hello");
    });

    it("should preserve word boundaries", () => {
      // "API" should match as whole word, not within "RAPID"
      const result = glossaryManager.applyGlossary("RAPID API development", "zh", glossary);
      expect(result).toBe("RAPID 接口 development");
    });

    it("should handle punctuation correctly", () => {
      const result = glossaryManager.applyGlossary("Hello, World!", "zh", glossary);
      expect(result).toBe("你好, 世界!");
    });
  });

  describe("Glossary Caching", () => {
    it("should cache loaded glossary and not reload on subsequent calls", async () => {
      const mockRows = [
        {
          en: "Test",
          zh: "测试",
        },
      ];

      mockSheet.getRows.mockResolvedValueOnce(mockRows);

      // First load
      const glossary1 = await glossaryManager.loadGlossary();
      // Second load (should use cache)
      const glossary2 = await glossaryManager.loadGlossary();

      expect(mockSheet.getRows).toHaveBeenCalledTimes(1); // Should only call once
      expect(glossary1).toEqual(glossary2);
    });

    it("should force reload when requested", async () => {
      const mockRows1 = [{ en: "Test1", zh: "测试1" }];
      const mockRows2 = [{ en: "Test2", zh: "测试2" }];

      mockSheet.getRows
        .mockResolvedValueOnce(mockRows1)
        .mockResolvedValueOnce(mockRows2);

      // First load
      const glossary1 = await glossaryManager.loadGlossary();
      // Force reload
      const glossary2 = await glossaryManager.loadGlossary(true);

      expect(mockSheet.getRows).toHaveBeenCalledTimes(2);
      expect(glossary1.zh).toEqual({ "Test1": "测试1" });
      expect(glossary2.zh).toEqual({ "Test2": "测试2" });
    });
  });

  describe("Error Recovery", () => {
    it("should return empty glossary on network errors", async () => {
      mockSheet.getRows.mockRejectedValueOnce(new Error("Network error"));

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
      mockSheet.getRows.mockRejectedValueOnce(new Error("Load failed"));

      await glossaryManager.loadGlossary();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load glossary")
      );

      consoleSpy.mockRestore();
    });
  });
});
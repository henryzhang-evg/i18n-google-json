import { llmTranslate, translateWithGlossary, isTermInGlossary, getTermTranslation } from "../llmTranslate";
import OpenAI from "openai";
import type { GlossaryMap } from "../../types";

// Mock OpenAI
jest.mock("openai");
const MockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

describe("llmTranslate", () => {
  let mockOpenAI: jest.Mocked<OpenAI>;
  let mockCreate: jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate = jest.fn();
    mockOpenAI = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as any;
    MockedOpenAI.mockImplementation(() => mockOpenAI);
  });

  describe("Retry Mechanisms and Error Handling", () => {
    it("should succeed on first attempt when API call is successful", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: "Hola mundo",
            },
          },
        ],
      };
      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await llmTranslate("Hello world", "en", "es", "test-api-key");

      expect(result).toBe("Hola mundo");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("should retry on network error and eventually succeed", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: "Bonjour le monde",
            },
          },
        ],
      };

      // First two calls fail, third succeeds
      mockCreate
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Timeout"))
        .mockResolvedValueOnce(mockResponse);

      const result = await llmTranslate("Hello world", "en", "fr", "test-api-key");

      expect(result).toBe("Bonjour le monde");
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it("should fallback to original text after exhausting retries", async () => {
      // All retry attempts fail
      mockCreate
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("API rate limit"))
        .mockRejectedValueOnce(new Error("Server error"));

      const result = await llmTranslate("Hello world", "en", "es", "test-api-key");

      expect(result).toBe("Hello world"); // Should fallback to original text
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it("should handle empty or undefined response content", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      };
      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await llmTranslate("Hello world", "en", "es", "test-api-key");

      expect(result).toBe("Hello world"); // Should fallback to original
    });

    it("should handle empty response choices array", async () => {
      const mockResponse = {
        choices: [],
      };
      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await llmTranslate("Hello world", "en", "es", "test-api-key");

      expect(result).toBe("Hello world"); // Should fallback to original
    });

    it("should return original text when input is empty", async () => {
      const result = await llmTranslate("", "en", "es", "test-api-key");

      expect(result).toBe("");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should return original text when input is only whitespace", async () => {
      const result = await llmTranslate("   ", "en", "es", "test-api-key");

      expect(result).toBe("   ");
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("Timeout Handling", () => {
    it("should respect timeout configuration and retry on timeout", async () => {
      const timeoutError = new Error("Request timeout");
      timeoutError.name = "TimeoutError";

      const mockResponse = {
        choices: [
          {
            message: {
              content: "Success after timeout",
            },
          },
        ],
      };

      mockCreate
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(mockResponse);

      const result = await llmTranslate("Hello world", "en", "es", "test-api-key");

      expect(result).toBe("Success after timeout");
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("should fallback to original text after multiple timeouts", async () => {
      const timeoutError = new Error("Request timeout");
      timeoutError.name = "TimeoutError";

      mockCreate
        .mockRejectedValueOnce(timeoutError)
        .mockRejectedValueOnce(timeoutError)
        .mockRejectedValueOnce(timeoutError);

      const result = await llmTranslate("Hello world", "en", "es", "test-api-key");

      expect(result).toBe("Hello world");
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });
  });

  describe("API Configuration", () => {
    it("should use correct model and API endpoint", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: "Translation result",
            },
          },
        ],
      };
      mockCreate.mockResolvedValueOnce(mockResponse);

      await llmTranslate("Test", "en", "es", "test-api-key");

      expect(MockedOpenAI).toHaveBeenCalledWith({
        apiKey: "test-api-key",
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "qwen-turbo", // Should use qwen-turbo instead of qwen-plus
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "system",
              content: expect.any(String),
            }),
            expect.objectContaining({
              role: "user",
              content: expect.stringContaining("Test"),
            }),
          ]),
        })
      );
    });

    it("should use temperature parameter for better quality control", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: "Temperature controlled translation",
            },
          },
        ],
      };
      mockCreate.mockResolvedValueOnce(mockResponse);

      await llmTranslate("Test", "en", "es", "test-api-key");

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.2, // Should use temperature for consistency
        })
      );
    });
  });

  describe("Enhanced Prompting", () => {
    it("should use professional translation prompt", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: "Professional translation",
            },
          },
        ],
      };
      mockCreate.mockResolvedValueOnce(mockResponse);

      await llmTranslate("Hello world", "en", "es", "test-api-key");

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: expect.stringMatching(/专业|professional|格式不变|不要过度翻译/i),
            }),
          ]),
        })
      );
    });

    it("should include target language code in prompt", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: "Spanish translation",
            },
          },
        ],
      };
      mockCreate.mockResolvedValueOnce(mockResponse);

      await llmTranslate("Hello", "en", "es", "test-api-key");

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: expect.stringMatching(/翻译为es/),
            }),
          ]),
        })
      );
    });
  });

  describe("Glossary Exact Matching (New Logic)", () => {
    let glossary: GlossaryMap;

    beforeEach(() => {
      glossary = {
        ko: {
          "Trading Mindshare": "거래 마인드셰어",
          "Crypto Mindshare": "암호화폐 마인드셰어",
          "API": "접구",
        },
        zh: {
          "Trading Mindshare": "交易思维份额",
          "Crypto Mindshare": "加密思维份额",
          "API": "接口",
        },
        es: {}
      };
    });

    describe("isTermInGlossary", () => {
      it("should return true when term exists in glossary", () => {
        expect(isTermInGlossary("Trading Mindshare", glossary)).toBe(true);
        expect(isTermInGlossary("API", glossary)).toBe(true);
      });

      it("should return false when term does not exist", () => {
        expect(isTermInGlossary("Unknown Term", glossary)).toBe(false);
        expect(isTermInGlossary("Hello World", glossary)).toBe(false);
      });

      it("should return false for empty glossary", () => {
        expect(isTermInGlossary("API", { ko: {}, zh: {} })).toBe(false);
      });
    });

    describe("getTermTranslation", () => {
      it("should return exact translation when term exists", () => {
        expect(getTermTranslation("Trading Mindshare", "ko", glossary)).toBe("거래 마인드셰어");
        expect(getTermTranslation("API", "zh", glossary)).toBe("接口");
      });

      it("should return null when term does not exist", () => {
        expect(getTermTranslation("Unknown Term", "ko", glossary)).toBeNull();
      });

      it("should return null when language does not exist in glossary", () => {
        expect(getTermTranslation("API", "fr", glossary)).toBeNull();
      });

      it("should return null for empty glossary language", () => {
        expect(getTermTranslation("API", "es", glossary)).toBeNull();
      });
    });

    describe("translateWithGlossary - Exact Match Logic", () => {
      it("should use glossary translation when exact match exists", async () => {
        const result = await translateWithGlossary(
          "Trading Mindshare",
          "en",
          "ko",
          "test-api-key",
          { enableGlossary: true },
          glossary
        );

        expect(result).toBe("거래 마인드셰어");
        expect(mockCreate).not.toHaveBeenCalled(); // Should NOT call LLM
      });

      it("should use LLM when exact match does not exist", async () => {
        const mockResponse = {
          choices: [{
            message: { content: "LLM 번역 결과" }
          }]
        };
        mockCreate.mockResolvedValueOnce(mockResponse);

        const result = await translateWithGlossary(
          "Hello World",
          "en",
          "ko",
          "test-api-key",
          { enableGlossary: true },
          glossary
        );

        expect(result).toBe("LLM 번역 결과");
        expect(mockCreate).toHaveBeenCalled(); // Should call LLM
      });

      it("should call LLM when glossary is disabled", async () => {
        const mockResponse = {
          choices: [{
            message: { content: "LLM 번역" }
          }]
        };
        mockCreate.mockResolvedValueOnce(mockResponse);

        const result = await translateWithGlossary(
          "Trading Mindshare",
          "en",
          "ko",
          "test-api-key",
          { enableGlossary: false },
          glossary
        );

        expect(result).toBe("LLM 번역");
        expect(mockCreate).toHaveBeenCalled();
      });

      it("should call LLM when glossary is not provided", async () => {
        const mockResponse = {
          choices: [{
            message: { content: "LLM 번역" }
          }]
        };
        mockCreate.mockResolvedValueOnce(mockResponse);

        const result = await translateWithGlossary(
          "Trading Mindshare",
          "en",
          "ko",
          "test-api-key",
          { enableGlossary: true }
        );

        expect(result).toBe("LLM 번역");
        expect(mockCreate).toHaveBeenCalled();
      });

      it("should handle case-sensitive exact matching", async () => {
        const mockResponse = {
          choices: [{
            message: { content: "LLM lowercase" }
          }]
        };
        mockCreate.mockResolvedValueOnce(mockResponse);

        // Exact match is case-sensitive now
        const result = await translateWithGlossary(
          "trading mindshare", // lowercase - no match
          "en",
          "ko",
          "test-api-key",
          { enableGlossary: true },
          glossary
        );

        expect(result).toBe("LLM lowercase");
        expect(mockCreate).toHaveBeenCalled();
      });

      it("should work with multiple languages correctly", async () => {
        const resultKo = await translateWithGlossary(
          "API",
          "en",
          "ko",
          "test-api-key",
          { enableGlossary: true },
          glossary
        );

        const resultZh = await translateWithGlossary(
          "API",
          "en",
          "zh",
          "test-api-key",
          { enableGlossary: true },
          glossary
        );

        expect(resultKo).toBe("접구");
        expect(resultZh).toBe("接口");
        expect(mockCreate).not.toHaveBeenCalled();
      });
    });
  });
});
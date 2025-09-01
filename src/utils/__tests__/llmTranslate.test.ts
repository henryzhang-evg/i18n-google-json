import { llmTranslate } from "../llmTranslate";
import OpenAI from "openai";

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
});
/**
 * Test case: Reproduce cross-module pollution bug
 *
 * Scenario:
 * - "Upgrade Now" exists in 9 translation modules (including UnlockBonusAura.ts)
 * - portfolio/layout.tsx uses I18n.t("Upgrade Now") but doesn't match any candidate module
 * - FALLBACK_MATCH_ALL marks ALL 9 modules as used, including UnlockBonusAura.ts
 * - Expected: Only modules with matching file paths should be marked as used
 * - Bug: UnlockBonusAura.ts is wrongly marked as used even though UnlockBonusAura.tsx doesn't use it
 */

jest.mock("../src/utils/StringUtils", () => ({
  Logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    setLogLevel: jest.fn(),
  },
  StringUtils: {
    isTranslatableString: jest.fn().mockReturnValue(false),
    cleanExtractedText: jest.fn().mockImplementation((text: string) => text.trim()),
    containsEnglishCharacters: jest.fn().mockReturnValue(true),
  },
}));

// Mock user interaction to auto-select all unused keys and confirm deletion
const mockSelectKeysForDeletion = jest.fn();
const mockConfirmDeletion = jest.fn();

jest.mock("../src/ui/InquirerInteractionAdapter", () => ({
  InquirerInteractionAdapter: jest.fn().mockImplementation(() => ({
    selectKeysForDeletion: mockSelectKeysForDeletion,
    confirmDeletion: mockConfirmDeletion,
    confirmRemoteSync: jest.fn().mockResolvedValue(false),
  })),
}));

const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockAccess = jest.fn();
const mockUnlink = jest.fn();

jest.mock("fs", () => ({
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    access: mockAccess,
    unlink: mockUnlink,
  },
  constants: { F_OK: 0 },
  appendFileSync: jest.fn(), // For debug log
  existsSync: jest.fn().mockReturnValue(false),
  unlinkSync: jest.fn(),
}));

jest.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue({}),
      })),
    },
    sheets: jest.fn().mockImplementation(() => ({
      spreadsheets: {
        values: { update: jest.fn(), get: jest.fn() },
      },
    })),
  },
}));

import { DeleteService } from "../src/core/DeleteService";
import { TranslationManager } from "../src/core/TranslationManager";
import type { I18nConfig } from "../src/types";
import type { ExistingReference } from "../src/core/AstTransformer";
import type { CompleteTranslationRecord } from "../src/core/TranslationManager";

describe("Cross-Module Pollution Bug", () => {
  let deleteService: DeleteService;
  let translationManager: TranslationManager;
  let mockConfig: I18nConfig;

  /**
   * Simulating the real scenario:
   * "Upgrade Now" exists in multiple translation modules
   */
  const existingCompleteRecord: CompleteTranslationRecord = {
    "components/aura/sidebar/UnlockBonusAura.ts": {
      "Unlock Bonus Aura": { en: "Unlock Bonus Aura", ko: "보너스 Aura 잠금 해제", mark: 0 } as any,
      "Upgrade Now": { en: "Upgrade Now", ko: "지금 업그레이드하세요", mark: 0 } as any, // ⚠️ NOT used in UnlockBonusAura.tsx
      "Upgrade": { en: "Upgrade", ko: "업그레이드", mark: 0 } as any,
      "with": { en: "with", ko: "와 함께", mark: 0 } as any,
      "Edgen": { en: "Edgen", ko: "Edgen", mark: 0 } as any,
    },
    "components/agent/AgentContent/AgentCover.ts": {
      "Upgrade Now": { en: "Upgrade Now", ko: "지금 업그레이드하세요", mark: 0 } as any,
    },
    "components/PricingGuidePopup/PricingGuideContent/PricingGuideContent.ts": {
      "Upgrade Now": { en: "Upgrade Now", ko: "지금 업그레이드하세요", mark: 0 } as any,
    },
  };

  /**
   * Current references from scanning:
   * - UnlockBonusAura.tsx uses: "Unlock Bonus Aura", "Upgrade", "with", "Edgen"
   * - UnlockBonusAura.tsx does NOT use: "Upgrade Now"
   * - portfolio/layout.tsx uses: "Upgrade Now" (but path doesn't match any module)
   * - AgentCover.tsx uses: "Upgrade Now"
   * - PricingGuideContent.tsx uses: "Upgrade Now"
   */
  const currentReferences = new Map<string, ExistingReference[]>([
    // UnlockBonusAura.tsx references (all should match)
    [
      "Unlock Bonus Aura",
      [
        {
          key: "Unlock Bonus Aura",
          filePath: "/proj/src/components/aura/sidebar/UnlockBonusAura.tsx",
          lineNumber: 20,
          columnNumber: 10,
          callExpression: 'I18n.t("Unlock Bonus Aura")',
        },
      ],
    ],
    [
      "Upgrade",
      [
        {
          key: "Upgrade",
          filePath: "/proj/src/components/aura/sidebar/UnlockBonusAura.tsx",
          lineNumber: 35,
          columnNumber: 10,
          callExpression: 'I18n.t("Upgrade")',
        },
      ],
    ],
    [
      "with",
      [
        {
          key: "with",
          filePath: "/proj/src/components/aura/sidebar/UnlockBonusAura.tsx",
          lineNumber: 22,
          columnNumber: 10,
          callExpression: 'I18n.t("with")',
        },
      ],
    ],
    [
      "Edgen",
      [
        {
          key: "Edgen",
          filePath: "/proj/src/components/aura/sidebar/UnlockBonusAura.tsx",
          lineNumber: 26,
          columnNumber: 10,
          callExpression: 'I18n.t("Edgen")',
        },
      ],
    ],
    // "Upgrade Now" references from OTHER files
    [
      "Upgrade Now",
      [
        // ⚠️ This reference from portfolio/layout.tsx doesn't match any candidate module
        {
          key: "Upgrade Now",
          filePath: "/proj/src/app/[locale]/(root)/portfolio/layout.tsx",
          lineNumber: 50,
          columnNumber: 10,
          callExpression: 'I18n.t("Upgrade Now")',
        },
        // These references match their respective modules
        {
          key: "Upgrade Now",
          filePath: "/proj/src/components/agent/AgentContent/AgentCover.tsx",
          lineNumber: 85,
          columnNumber: 10,
          callExpression: 'I18n.t("Upgrade Now")',
        },
        {
          key: "Upgrade Now",
          filePath: "/proj/src/components/PricingGuidePopup/PricingGuideContent/PricingGuideContent.tsx",
          lineNumber: 137,
          columnNumber: 10,
          callExpression: 'I18n.t("Upgrade Now")',
        },
      ],
    ],
  ]);

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      rootDir: "/proj/src",
      spreadsheetId: "test-spreadsheet-id",
      sheetName: "test-sheet",
      languages: ["en", "ko"],
      sheetsReadRange: "A1:Z10000",
      sheetsMaxRows: 10000,
      outputDir: "translate",
      ignore: [],
      keyFile: "test-key.json",
      startMarker: "~",
      endMarker: "~",
      include: [".ts", ".tsx"],
      apiKey: "test-api-key",
    } as any;

    // Configure mocks to automatically select all unused keys and confirm deletion
    mockSelectKeysForDeletion.mockImplementation((keys: string[]) => {
      // Auto-select all detected unused keys
      return Promise.resolve(keys);
    });
    mockConfirmDeletion.mockResolvedValue(true);

    translationManager = new TranslationManager(mockConfig);
    deleteService = new DeleteService(mockConfig, translationManager);

    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes("i18n-complete-record.json")) {
        return Promise.resolve(JSON.stringify(existingCompleteRecord));
      }
      return Promise.resolve("{}");
    });

    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockAccess.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it("should NOT mark UnlockBonusAura's 'Upgrade Now' as used when portfolio/layout.tsx uses it", async () => {
    const result = await deleteService.detectUnusedKeysAndGenerateRecord(
      currentReferences
    );

    const finalRecord = result.processedRecord as CompleteTranslationRecord;
    const unlockBonusAuraModule = finalRecord["components/aura/sidebar/UnlockBonusAura.ts"];

    // Verify that UnlockBonusAura module still exists
    expect(unlockBonusAuraModule).toBeDefined();

    // Keys that ARE used in UnlockBonusAura.tsx should be preserved
    expect(unlockBonusAuraModule["Unlock Bonus Aura"]).toBeDefined();
    expect(unlockBonusAuraModule["Upgrade"]).toBeDefined();
    expect(unlockBonusAuraModule["with"]).toBeDefined();
    expect(unlockBonusAuraModule["Edgen"]).toBeDefined();

    // ⚠️ THE KEY ASSERTION: "Upgrade Now" should be REMOVED because it's not used in UnlockBonusAura.tsx
    // Even though portfolio/layout.tsx uses it, that shouldn't affect UnlockBonusAura module (1:1 principle)
    expect(unlockBonusAuraModule["Upgrade Now"]).toBeUndefined();
  });

  it("should preserve 'Upgrade Now' in modules where it IS actually used", async () => {
    const result = await deleteService.detectUnusedKeysAndGenerateRecord(
      currentReferences
    );

    const finalRecord = result.processedRecord as CompleteTranslationRecord;

    // AgentCover.tsx uses "Upgrade Now" and paths match - should be preserved
    const agentCoverModule = finalRecord["components/agent/AgentContent/AgentCover.ts"];
    expect(agentCoverModule).toBeDefined();
    expect(agentCoverModule["Upgrade Now"]).toBeDefined();

    // PricingGuideContent.tsx uses "Upgrade Now" and paths match - should be preserved
    const pricingModule = finalRecord["components/PricingGuidePopup/PricingGuideContent/PricingGuideContent.ts"];
    expect(pricingModule).toBeDefined();
    expect(pricingModule["Upgrade Now"]).toBeDefined();
  });

  it("should correctly report unused keys count for UnlockBonusAura module", async () => {
    const result = await deleteService.detectUnusedKeysAndGenerateRecord(
      currentReferences
    );

    // UnlockBonusAura has 5 keys total
    // - "Unlock Bonus Aura" ✓ used
    // - "Upgrade" ✓ used
    // - "with" ✓ used
    // - "Edgen" ✓ used
    // - "Upgrade Now" ✗ NOT used (should be detected as unused)

    // After deletion, only 4 keys should remain
    const finalRecord = result.processedRecord as CompleteTranslationRecord;
    const unlockBonusAuraModule = finalRecord["components/aura/sidebar/UnlockBonusAura.ts"];

    expect(Object.keys(unlockBonusAuraModule).length).toBe(4);
  });
});

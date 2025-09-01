import { Logger } from "./StringUtils";
import { GlossaryMap, I18nConfig } from "../types";
import { GoogleSheetsClient, SheetData } from "./GoogleSheetsClient";

export class GlossaryManager {
  private glossaryCache: GlossaryMap | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
  private sheetsClient: GoogleSheetsClient;

  constructor(private config: I18nConfig) {
    // 创建 Google Sheets 客户端实例
    this.sheetsClient = new GoogleSheetsClient({
      keyFile: config.keyFile,
      languages: config.languages,
    });
  }

  /**
   * 加载术语表从Google Sheets
   * @param forceReload 是否强制重新加载
   * @returns 术语表映射
   */
  async loadGlossary(forceReload = false): Promise<GlossaryMap> {
    // 检查缓存
    if (
      !forceReload &&
      this.glossaryCache &&
      Date.now() - this.cacheTimestamp < this.CACHE_TTL
    ) {
      Logger.debug("📚 [术语表] 使用缓存的术语表");
      return this.glossaryCache;
    }

    try {
      Logger.info("📚 [术语表] 开始从Google Sheets加载术语表...");

      if (!this.config.glossarySpreadsheetId) {
        Logger.warn("📚 [术语表] 未配置术语表Spreadsheet ID，返回空术语表");
        return this.createEmptyGlossary();
      }

      // 检查 Google Sheets 客户端状态
      if (!this.sheetsClient.isReady()) {
        Logger.warn("📚 [术语表] Google Sheets 客户端未初始化，返回空术语表");
        return this.createEmptyGlossary();
      }

      // 使用通用客户端读取数据
      const sheetName = this.config.glossarySheetName || "terms";
      const range = `${sheetName}!A1:Z1000`; // 读取前1000行的所有列
      
      const sheetData: SheetData = await this.sheetsClient.readSheet(
        this.config.glossarySpreadsheetId,
        range
      );

      if (sheetData.values.length === 0) {
        Logger.warn("📚 [术语表] 术语表为空，返回空术语表");
        return this.createEmptyGlossary();
      }

      const headers = sheetData.headers;
      const rows = sheetData.values.slice(1); // 跳过表头

      Logger.info(`📚 [术语表] 找到 ${rows.length} 条术语记录`);

      // 构建术语表映射
      const glossary = this.createEmptyGlossary();
      let validTermsCount = 0;

      // 找到每种语言在表头中的索引
      const langIndices = new Map<string, number>();
      headers.forEach((header: string, index: number) => {
        if (this.config.languages.includes(header)) {
          langIndices.set(header, index);
        }
      });

      rows.forEach((row: any[]) => {
        const englishTermIndex = langIndices.get("en");
        if (englishTermIndex === undefined) {
          return; // 没有找到英文列
        }

        const englishTerm = row[englishTermIndex]?.trim();
        if (!englishTerm) {
          return; // 跳过没有英文术语的行
        }

        let hasValidTranslation = false;
        this.config.languages.forEach((langCode) => {
          if (langCode === "en") return; // 跳过英文

          const langIndex = langIndices.get(langCode);
          if (langIndex === undefined) return;

          const translation = row[langIndex]?.trim();
          if (translation) {
            if (!glossary[langCode]) {
              glossary[langCode] = {};
            }
            glossary[langCode][englishTerm] = translation;
            hasValidTranslation = true;
          }
        });

        if (hasValidTranslation) {
          validTermsCount++;
        }
      });

      Logger.info(`✅ [术语表] 成功加载 ${validTermsCount} 个有效术语`);

      // 更新缓存
      this.glossaryCache = glossary;
      this.cacheTimestamp = Date.now();

      return glossary;
    } catch (error) {
      Logger.warn(`⚠️ [术语表] 加载术语表失败: ${error instanceof Error ? error.message : String(error)}`);
      Logger.warn("📚 [术语表] 返回空术语表以确保翻译功能继续工作");
      return this.createEmptyGlossary();
    }
  }

  /**
   * 应用术语表进行术语替换
   * @param text 待处理文本
   * @param languageCode 目标语言代码
   * @param glossary 术语表映射
   * @returns 替换后的文本
   */
  applyGlossary(
    text: string,
    languageCode: string,
    glossary: GlossaryMap
  ): string {
    const langGlossary = glossary[languageCode];
    if (!langGlossary || Object.keys(langGlossary).length === 0) {
      return text;
    }

    let result = text;
    let replacementCount = 0;

    // 按术语长度排序，优先匹配长术语（避免短术语覆盖长术语）
    const sortedTerms = Object.keys(langGlossary).sort((a, b) => b.length - a.length);

    sortedTerms.forEach((englishTerm) => {
      const translation = langGlossary[englishTerm];
      if (translation) {
        // 转义特殊字符，构建词边界匹配的正则表达式
        const escapedTerm = englishTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escapedTerm}\\b`, "gi");
        
        const beforeReplace = result;
        result = result.replace(regex, translation);
        
        if (result !== beforeReplace) {
          replacementCount++;
          Logger.debug(`📚 [术语表] 替换术语: "${englishTerm}" -> "${translation}"`);
        }
      }
    });

    if (replacementCount > 0) {
      Logger.debug(`📚 [术语表] 共完成 ${replacementCount} 个术语替换`);
    }

    return result;
  }

  /**
   * 创建空的术语表映射
   */
  private createEmptyGlossary(): GlossaryMap {
    const glossary: GlossaryMap = {};
    this.config.languages.forEach((lang) => {
      if (lang !== "en") {
        glossary[lang] = {};
      }
    });
    return glossary;
  }

  /**
   * 清除术语表缓存
   */
  clearCache(): void {
    this.glossaryCache = null;
    this.cacheTimestamp = 0;
    Logger.debug("📚 [术语表] 缓存已清除");
  }

  /**
   * 获取术语表统计信息
   */
  getGlossaryStats(glossary: GlossaryMap): {
    totalTerms: number;
    languageStats: Record<string, number>;
  } {
    let totalTerms = 0;
    const languageStats: Record<string, number> = {};

    Object.keys(glossary).forEach((lang) => {
      const termCount = Object.keys(glossary[lang]).length;
      languageStats[lang] = termCount;
      if (termCount > totalTerms) {
        totalTerms = termCount;
      }
    });

    return { totalTerms, languageStats };
  }
}
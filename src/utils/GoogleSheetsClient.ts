import { google } from "googleapis";
import { I18nError, I18nErrorType, ErrorHandler } from "../errors/I18nError";
import { Logger } from "./StringUtils";

export interface GoogleSheetsConfig {
  keyFile: string;
  languages: string[];
}

export interface SheetData {
  values: any[][];
  headers: string[];
}

/**
 * Google Sheets 通用客户端，提供统一的认证和基础操作
 * 被 GoogleSheetsSync 和 GlossaryManager 共享使用
 */
export class GoogleSheetsClient {
  private googleSheets: any;
  private isInitialized: boolean = false;
  private initPromise: Promise<void>;

  constructor(private config: GoogleSheetsConfig) {
    this.initPromise = this.initGoogleSheets();
  }

  /**
   * 确保初始化完成
   */
  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  /**
   * 初始化 Google Sheets API
   */
  private async initGoogleSheets(): Promise<void> {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: this.config.keyFile,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const authClient = await auth.getClient();
      this.googleSheets = google.sheets({
        version: "v4",
        auth: authClient as any,
      });

      this.isInitialized = true;
      Logger.info("✅ Google Sheets API 初始化成功");
    } catch (error) {
      Logger.warn("⚠️ Google Sheets API 初始化失败，将使用模拟模式:", error);
      this.isInitialized = false;
      // 在测试环境中提供模拟实现
      this.googleSheets = {
        spreadsheets: {
          values: {
            get: async () => ({ data: { values: [] } }),
            update: async () => ({}),
          },
          get: async () => ({
            data: {
              sheets: [
                {
                  properties: {
                    title: "Sheet1",
                    gridProperties: {
                      columnCount: Math.max(
                        this.config.languages.length + 1,
                        26
                      ),
                      rowCount: 1000,
                    },
                  },
                },
              ],
            },
          }),
        },
      };
    }
  }

  /**
   * 检查是否已初始化
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * 从指定的 Google Sheets 读取数据
   * @param spreadsheetId 表格ID
   * @param range 读取范围，如 "Sheet1!A1:Z1000"
   * @returns 表格数据
   */
  public async readSheet(
    spreadsheetId: string,
    range: string
  ): Promise<SheetData> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      Logger.info("🔄 Google Sheets 未初始化，返回空数据");
      return { values: [], headers: [] };
    }

    try {
      Logger.debug(`📖 [GoogleSheets] 读取数据: ${spreadsheetId} 范围: ${range}`);

      const response = await this.googleSheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = response.data.values || [];
      const headers = values[0] || [];

      Logger.debug(
        `✅ [GoogleSheets] 成功读取 ${values.length} 行数据，表头: ${headers.length} 列`
      );

      return { values, headers };
    } catch (error) {
      Logger.error(`❌ [GoogleSheets] 读取失败: ${range}`, error);
      this.handleSheetsError(error, "读取Google Sheets");
      return { values: [], headers: [] };
    }
  }

  /**
   * 向指定的 Google Sheets 写入数据
   * @param spreadsheetId 表格ID
   * @param range 写入范围，如 "Sheet1!A1:Z1000"
   * @param values 要写入的数据
   */
  public async writeSheet(
    spreadsheetId: string,
    range: string,
    values: any[][]
  ): Promise<void> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      Logger.info("🔄 Google Sheets 未初始化，跳过写入");
      return;
    }

    try {
      Logger.debug(
        `📝 [GoogleSheets] 写入数据: ${spreadsheetId} 范围: ${range} 行数: ${values.length}`
      );

      await this.googleSheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        resource: { values },
      });

      Logger.debug(
        `✅ [GoogleSheets] 成功写入 ${values.length} 行数据到 ${range}`
      );
    } catch (error) {
      Logger.error(`❌ [GoogleSheets] 写入失败: ${range}`, error);
      this.handleSheetsError(error, "写入Google Sheets");
      throw error;
    }
  }

  /**
   * 获取表格信息
   * @param spreadsheetId 表格ID
   * @returns 表格元数据
   */
  public async getSpreadsheetInfo(spreadsheetId: string): Promise<any> {
    await this.ensureInitialized();

    if (!this.isInitialized) {
      Logger.info("🔄 Google Sheets 未初始化，返回模拟信息");
      return {
        sheets: [
          {
            properties: {
              title: "Sheet1",
              gridProperties: {
                columnCount: Math.max(this.config.languages.length + 1, 26),
                rowCount: 1000,
              },
            },
          },
        ],
      };
    }

    try {
      const response = await this.googleSheets.spreadsheets.get({
        spreadsheetId,
      });

      return response.data;
    } catch (error) {
      Logger.error(`❌ [GoogleSheets] 获取表格信息失败: ${spreadsheetId}`, error);
      this.handleSheetsError(error, "获取表格信息");
      throw error;
    }
  }

  /**
   * 计算动态范围字符串
   * @param columnCount 列数
   * @param rowCount 行数
   * @returns 格式化的范围字符串，如 "A1:C100"
   */
  public calculateRange(columnCount: number, rowCount: number = 1000): string {
    // 将列数转换为Excel列标识符 (A, B, C, ..., Z, AA, AB, ...)
    const getColumnLetter = (index: number): string => {
      let letter = "";
      while (index >= 0) {
        letter = String.fromCharCode(65 + (index % 26)) + letter;
        index = Math.floor(index / 26) - 1;
      }
      return letter;
    };

    const lastColumn = getColumnLetter(columnCount - 1);
    return `A1:${lastColumn}${rowCount}`;
  }

  /**
   * 处理 Google Sheets 错误
   */
  private handleSheetsError(error: any, operation: string): void {
    if (
      (error as any).code === "ENOTFOUND" ||
      (error as any).code === "ECONNREFUSED"
    ) {
      throw ErrorHandler.createNetworkError(operation, error as Error);
    } else if ((error as any).code === 401 || (error as any).code === 403) {
      throw new I18nError(
        I18nErrorType.AUTHENTICATION_ERROR,
        "Google Sheets API 认证失败",
        { originalError: error },
        [
          "检查服务账号密钥文件是否正确",
          "确认Google Sheets API是否已启用",
          "验证Sheet写入权限",
        ]
      );
    } else {
      throw new I18nError(
        I18nErrorType.API_ERROR,
        `${operation}失败`,
        { originalError: error },
        [
          "检查网络连接",
          "确认spreadsheetId是否正确",
          "验证Sheet是否有足够空间",
          "稍后重试操作",
        ],
        true // API错误通常是可恢复的
      );
    }
  }

  /**
   * 获取客户端状态信息（用于调试）
   */
  public getStatus(): {
    initialized: boolean;
    hasGoogleSheets: boolean;
    configLanguages: number;
  } {
    return {
      initialized: this.isInitialized,
      hasGoogleSheets: !!this.googleSheets,
      configLanguages: this.config.languages.length,
    };
  }
}
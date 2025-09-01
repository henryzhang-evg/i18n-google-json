export interface I18nConfig {
  rootDir: string;
  languages: string[];
  ignore: string[];
  spreadsheetId: string;
  sheetName: string;
  keyFile: string;
  startMarker: string; // 开始标记符号
  endMarker: string; // 结尾标记符号
  include: string[];
  outputDir: string;
  forceKeepKeys?: Record<string, string[]>; // 按模块路径强制保留的Key列表
  logLevel?: "silent" | "normal" | "verbose"; // 日志级别配置
  sheetsReadRange?: string; // Google Sheets 读取范围，默认 "A1:Z10000"
  apiKey: string;
  sheetsMaxRows?: number; // Google Sheets 最大行数，默认10000
  testMode?: boolean; // 测试模式：屏蔽二次确认等交互
  
  // Enhanced LLM translation configuration
  llmRetries?: number; // LLM翻译重试次数，默认3
  llmTimeout?: number; // LLM翻译超时时间（毫秒），默认30000
  llmTemperature?: number; // LLM翻译温度参数，默认0.2
  llmModel?: string; // LLM模型名称，默认qwen-turbo
  
  // Glossary configuration
  glossarySpreadsheetId?: string; // 术语表Google Sheets ID
  glossarySheetName?: string; // 术语表sheet名称，默认terms
  enableGlossary?: boolean; // 是否启用术语表，默认false
}

// Enhanced translation options
export interface TranslationOptions {
  retries?: number;
  timeout?: number;
  temperature?: number;
  model?: string;
  enableGlossary?: boolean;
}

// Glossary structure
export interface GlossaryMap {
  [languageCode: string]: {
    [englishTerm: string]: string;
  };
}

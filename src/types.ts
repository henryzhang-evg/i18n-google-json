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
  translationCallStrategy?: TranslationCallStrategy; // 翻译调用策略（可选）
  /** 是否生成 outputDir 下的模块化 .ts 翻译文件，默认 true */
  generateModuleFiles?: boolean;
  /** 是否生成扁平 locale JSON（./locals/{lang}.json），默认 true */
  localeJson?: boolean;
  /** locale JSON 输出目录（相对 cwd），默认 ./locals */
  localeJsonDir?: string;
  /** locale JSON key 组织模式：raw=直接用 key，namespaced=按 namespace 嵌套对象 */
  localeJsonKeyMode?: "raw" | "namespaced";
}

export interface TranslationCallStrategy {
  component?: {
    enabled?: boolean; // 是否启用组件内 useTranslation 策略
    hookName?: string; // 默认 useTranslation
    hookImportFrom?: string; // 默认 react-i18next
    translatorName?: string; // 默认 t
  };
  module?: {
    enabled?: boolean; // 是否启用纯函数模块固定 i18n.t 策略，默认 true
  };
  namespace?: {
    enabled?: boolean; // 开启后：组件 useTranslation(ns)，模块 i18n.t(key, { ns })
    shortKey?: boolean; // 开启后生成短 key（如 AI & Tech -> AI_Tech）
  };
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

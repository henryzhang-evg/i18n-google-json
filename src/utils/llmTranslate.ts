import OpenAI from "openai";
import { Logger } from "./StringUtils";
import { TranslationOptions, GlossaryMap } from "../types";


/**
 * 使用 Qwen 大模型进行翻译（增强版本，支持重试、术语表和错误恢复）
 * @param text 原文
 * @param from 源语言（如 'en'）
 * @param to 目标语言（如 'zh-Hans'）
 * @param apiKey API密钥
 * @param options 翻译选项
 */
export async function llmTranslate(
  text: string,
  from: string,
  to: string,
  apiKey: string,
  options: TranslationOptions = {}
): Promise<string> {
  // 早期返回：空文本或仅空白字符
  if (!text || !text.trim()) {
    return text;
  }

  const {
    retries = 3,
    timeout = 30000,
    temperature = 0.2,
    model = "qwen-turbo",
  } = options;

  Logger.info(`🤖 [AI翻译] 正在将 "${text}" 从 ${from} 翻译为 ${to} ...`);

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  });

  // 构建专业翻译提示
  const prompt = `请将以下英文翻译为${to}，保持语义专业、格式不变、不要过度翻译：

${text.trim()}`;

  // 重试逻辑
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      Logger.debug(`🔄 [AI翻译] 尝试第 ${attempt}/${retries} 次...`);

      const completion = await Promise.race([
        openai.chat.completions.create({
          model,
          messages: [
            { 
              role: "system", 
              content: "You are a professional translator. Translate accurately while preserving formatting and avoiding over-translation." 
            },
            { role: "user", content: prompt },
          ],
          temperature,
        }),
        // 超时处理
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout")), timeout)
        ),
      ]);

      const translated = completion.choices[0]?.message.content?.trim();
      
      if (translated) {
        Logger.info(`✅ [AI翻译] 翻译成功: ${translated}`);
        return translated;
      } else {
        Logger.warn(`⚠️ [AI翻译] 第 ${attempt} 次尝试返回空结果`);
        if (attempt === retries) {
          Logger.warn(`❌ [AI翻译] 所有尝试失败，返回原文: ${text}`);
          return text; // 降级到原文
        }
      }
    } catch (error) {
      Logger.warn(`⚠️ [AI翻译] 第 ${attempt} 次尝试失败: ${error instanceof Error ? error.message : String(error)}`);
      
      if (attempt === retries) {
        Logger.warn(`❌ [AI翻译] 所有尝试失败，返回原文: ${text}`);
        return text; // 降级到原文
      }
      
      // 短暂等待后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  return text; // 兜底返回原文
}

/**
 * 应用术语表进行术语替换
 * @param text 待处理文本
 * @param languageCode 目标语言代码
 * @param glossary 术语表映射
 */
export function applyGlossary(
  text: string,
  languageCode: string,
  glossary: GlossaryMap
): string {
  const langGlossary = glossary[languageCode];
  if (!langGlossary || Object.keys(langGlossary).length === 0) {
    return text;
  }

  let result = text;
  
  // 按术语长度排序，优先匹配长术语
  const sortedTerms = Object.keys(langGlossary).sort((a, b) => b.length - a.length);
  
  sortedTerms.forEach(englishTerm => {
    const translation = langGlossary[englishTerm];
    if (translation) {
      // 使用词边界匹配，避免部分匹配
      const regex = new RegExp(`\\b${englishTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      result = result.replace(regex, translation);
    }
  });

  return result;
}

/**
 * 带术语表支持的翻译函数
 * @param text 原文
 * @param from 源语言
 * @param to 目标语言
 * @param apiKey API密钥
 * @param options 翻译选项
 * @param glossary 术语表（可选）
 */
export async function translateWithGlossary(
  text: string,
  from: string,
  to: string,
  apiKey: string,
  options: TranslationOptions = {},
  glossary?: GlossaryMap
): Promise<string> {
  // 先进行基础翻译
  const translated = await llmTranslate(text, from, to, apiKey, options);
  
  // 如果启用术语表且术语表可用，则应用术语替换
  if (options.enableGlossary && glossary) {
    const withGlossary = applyGlossary(translated, to, glossary);
    if (withGlossary !== translated) {
      Logger.info(`📚 [术语表] 应用术语替换: "${translated}" -> "${withGlossary}"`);
    }
    return withGlossary;
  }
  
  return translated;
}

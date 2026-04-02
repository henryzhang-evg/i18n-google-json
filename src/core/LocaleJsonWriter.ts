import * as fs from "fs";
import * as path from "path";
import type { CompleteTranslationRecord } from "./TranslationManager";
import { PathUtils } from "../utils/PathUtils";

/**
 * 将完整记录转为按语言分组的 locale 对象。
 * - raw: { "AI_Tech": "AI & Tech" }
 * - namespaced: { "onboarding.screens.Step2MarketsTopicsScreen": { "AI_Tech": "AI & Tech" } }
 */
export function buildLocaleMapsPerLanguage(
  completeRecord: CompleteTranslationRecord,
  languages: string[],
  keyMode: "raw" | "namespaced" = "raw"
): Record<string, Record<string, any>> {
  const result: Record<string, Record<string, any>> = {};
  languages.forEach((lang) => {
    result[lang] = {};
  });

  const sortedModules = Object.keys(completeRecord).sort((a, b) =>
    a.localeCompare(b)
  );

  for (const modulePath of sortedModules) {
    const namespace = PathUtils.modulePathToLocaleNamespace(modulePath);
    const moduleKeys = completeRecord[modulePath];
    const sortedKeys = Object.keys(moduleKeys).sort((a, b) => a.localeCompare(b));

    for (const translationKey of sortedKeys) {
      const entry = moduleKeys[translationKey] as Record<string, unknown>;

      for (const lang of languages) {
        const val = entry[lang];
        if (typeof val === "string") {
          if (keyMode === "raw") {
            result[lang][translationKey] = val;
          } else {
            if (!result[lang][namespace]) {
              result[lang][namespace] = {};
            }
            result[lang][namespace][translationKey] = val;
          }
        }
      }
    }
  }

  return result;
}

/**
 * 写入 ./locals/{language}.json（路径相对 cwd 解析）。
 */
export async function writeFlatLocaleJsonFiles(
  localeRootDir: string,
  completeRecord: CompleteTranslationRecord,
  languages: string[],
  keyMode: "raw" | "namespaced" = "raw"
): Promise<void> {
  const absRoot = path.resolve(process.cwd(), localeRootDir);
  await fs.promises.mkdir(absRoot, { recursive: true });

  const perLang = buildLocaleMapsPerLanguage(completeRecord, languages, keyMode);

  for (const lang of languages) {
    const filePath = path.join(absRoot, `${lang}.json`);
    const ordered = sortObjectDeep(perLang[lang] || {});
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(ordered, null, 2),
      "utf-8"
    );
  }

  await writeLocaleIndexFile(absRoot, languages, completeRecord);
}

function sortObjectDeep(input: any): any {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const out: Record<string, any> = {};
  Object.keys(input)
    .sort((a, b) => a.localeCompare(b))
    .forEach((k) => {
      out[k] = sortObjectDeep(input[k]);
    });
  return out;
}

async function writeLocaleIndexFile(
  absRoot: string,
  languages: string[],
  completeRecord: CompleteTranslationRecord
): Promise<void> {
  const imports = languages
    .map((lang) => {
      const varName = toImportVar(lang);
      return `import ${varName} from './${lang}.json';`;
    })
    .join("\n");

  const resourcesBody = languages
    .map((lang) => {
      const varName = toImportVar(lang);
      return `  ${JSON.stringify(lang)}: ${varName},`;
    })
    .join("\n");

  const namespaces = collectNamespaces(completeRecord);
  const nsBody = namespaces.map((ns) => `  ${JSON.stringify(ns)},`).join("\n");

  const content =
    `${imports}\n\n` +
    `export const I18N_GOOGLE_RESOURCES = {\n${resourcesBody}\n} as const;\n\n` +
    `export const I18N_GOOGLE_NAMESPACES = [\n${nsBody}\n] as const;\n`;

  await fs.promises.writeFile(path.join(absRoot, "index.ts"), content, "utf-8");
}

function toImportVar(language: string): string {
  const normalized = language.replace(/[^a-zA-Z0-9_]/g, "_");
  const safe = /^[0-9]/.test(normalized) ? `lang_${normalized}` : normalized;
  return `locale_${safe}`;
}

function collectNamespaces(
  completeRecord: CompleteTranslationRecord
): string[] {
  const set = new Set<string>();
  Object.keys(completeRecord).forEach((modulePath) => {
    const ns = PathUtils.modulePathToLocaleNamespace(modulePath);
    if (ns) set.add(ns);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

import * as jscodeshift from "jscodeshift";
import type { ASTPath } from "jscodeshift";
import { namedTypes as n } from "ast-types";
import type { I18nConfig } from "../types";
import { StringUtils, Logger } from "../utils/StringUtils";
import { AstUtils } from "../utils/AstUtils";
import { PathUtils } from "../utils/PathUtils";

export interface TransformResult {
  key: string;
  text: string;
}

export interface ExistingReference {
  key: string; // I18n Key
  filePath: string; // 文件路径
  lineNumber: number; // 行号
  columnNumber: number; // 列号
  callExpression: string; // 完整的调用表达式 "I18n.t('8a709a33')"
}

export interface FileAnalysisResult {
  existingReferences: ExistingReference[]; // 现有的引用
  newTranslations: TransformResult[]; // 新生成的翻译
  transformedCode: string; // 转换后的代码
}

interface TemplateProcessResult {
  translationResult: TransformResult;
  callExpr: n.CallExpression;
}

// 定义 jscodeshift API 类型
type JSCodeshiftAPI = ReturnType<typeof jscodeshift.withParser>;
type JSCodeshiftCollection = ReturnType<JSCodeshiftAPI>;

/**
 * AST 转换器 - 负责将源码中的文本转换为 I18n 调用
 * 这是一个纯粹的转换逻辑模块，不包含文件 I/O 操作
 */
export class AstTransformer {
  constructor(private config: I18nConfig) {}

  /**
   * 转换源码字符串为包含 I18n 调用的代码
   * @param source - 源码字符串
   * @param filePath - 文件路径（用于生成翻译键）
   * @returns 转换结果和修改后的代码
   */
  public transformSource(
    source: string,
    filePath: string
  ): { results: TransformResult[]; transformedCode: string } {
    const { root, j } = this.parseSource(source);
    return this.performTransformation(root, j, filePath);
  }

  /**
   * 收集源码中现有的 I18n.t() 调用
   * @param source - 源码字符串
   * @param filePath - 文件路径
   * @returns 现有的 I18n 引用列表
   */
  public collectExistingI18nCalls(
    source: string,
    filePath: string
  ): ExistingReference[] {
    const { root, j } = this.parseSource(source);
    return this.scanExistingI18nCalls(root, j, filePath);
  }

  /**
   * 分析和转换源码：收集现有引用 + 处理新翻译
   */
  public analyzeAndTransformSource(
    source: string,
    filePath: string
  ): FileAnalysisResult {
    const { root, j } = this.parseSource(source);

    // 收集现有的 I18n 引用
    const existingReferences = this.scanExistingI18nCalls(root, j, filePath);

    // 执行转换并跟踪新增引用
    const { results: newTranslations, transformedCode } = 
      this.performTransformation(root, j, filePath);

    // 只有当存在引用时才进行导入管理
    if (existingReferences.length > 0 || newTranslations.length > 0) {
      // 重新解析转换后的代码进行导入管理
      const { root: finalRoot, j: finalJ } = this.parseSource(transformedCode);
      this.unifiedImportManagement(finalJ, finalRoot, filePath, false);
      const finalTransformedCode = finalRoot.toSource();
      
      return {
        existingReferences: [
          ...existingReferences,
          ...newTranslations.map(t => ({
            key: t.key,
            filePath,
            lineNumber: 0,
            columnNumber: 0,
            callExpression: `I18n.t("${t.key}")`
          }))
        ],
        newTranslations,
        transformedCode: finalTransformedCode,
      };
    }

    // 对于没有引用的情况，返回原始结果
    return {
      existingReferences,
      newTranslations,
      transformedCode,
    };
  }

  /**
   * 解析源码为AST
   */
  private parseSource(source: string): { root: JSCodeshiftCollection; j: JSCodeshiftAPI } {
    const j = jscodeshift.withParser("tsx");
    const root = j(source);
    return { root, j };
  }

  /**
   * 执行代码转换
   */
  private performTransformation(
    root: JSCodeshiftCollection,
    j: JSCodeshiftAPI,
    filePath: string
  ): { results: TransformResult[]; transformedCode: string } {
    const results: TransformResult[] = [];

    // 查找需要翻译的字符串字面量（带标记符号）
    this.transformStringLiterals(root, j, filePath, results);

    // 查找需要翻译的模板字符串（带标记符号）
    this.transformTemplateLiterals(root, j, filePath, results);

    // 查找需要翻译的JSX文本节点（纯文本）
    this.transformJSXTextNodes(root, j, filePath, results);

    // 添加模块化导入
    if (results.length > 0) {
      this.unifiedImportManagement(j, root, filePath, true);
    }

    const transformedCode = root.toSource();

    return { results, transformedCode };
  }

  /**
   * 统一的扫描实现：在已有 AST 基础上收集 I18n.t 引用
   */
  private scanExistingI18nCalls(
    root: JSCodeshiftCollection,
    j: JSCodeshiftAPI,
    filePath: string
  ): ExistingReference[] {
    const references: ExistingReference[] = [];
    root.find(j.CallExpression).forEach((path: ASTPath<n.CallExpression>) => {
      const callExpr = path.node;
      if (!this.isI18nTCall(callExpr)) return;
      const keyArg = callExpr.arguments[0];
      if (n.Literal.check(keyArg) && typeof keyArg.value === "string") {
        const key = keyArg.value;
        const loc = callExpr.loc;
        if (loc && loc.start) {
          references.push({
            key,
            filePath,
            lineNumber: loc.start.line,
            columnNumber: loc.start.column,
            callExpression: `I18n.t("${key}")`,
          });
        }
      } else if (n.TemplateLiteral.check(keyArg)) {
        if (keyArg.expressions.length === 0 && keyArg.quasis.length === 1) {
          const key =
            keyArg.quasis[0].value.cooked || keyArg.quasis[0].value.raw;
          const loc = callExpr.loc;
          if (loc && loc.start) {
            references.push({
              key,
              filePath,
              lineNumber: loc.start.line,
              columnNumber: loc.start.column,
              callExpression: `I18n.t(\`${key}\`)`,
            });
          }
        }
      }
    });
    return references;
  }

  /**
   * 统一的导入管理：验证、修复和添加所需的导入
   */
  private unifiedImportManagement(
    j: JSCodeshiftAPI,
    root: JSCodeshiftCollection,
    filePath: string,
    addImports: boolean = false
  ): void {
    const correctImportPath = PathUtils.getTranslationImportPath(
      filePath,
      this.config
    );

    // 处理翻译文件导入
    this.handleTranslationImport(j, root, correctImportPath);

    // 处理I18nUtil导入
    if (addImports) {
      this.handleI18nUtilImport(j, root);
      this.addScopedInitialization(j, root, "Translations");
    }
  }

  /**
   * 处理翻译文件导入的统一逻辑
   */
  private handleTranslationImport(
    j: JSCodeshiftAPI,
    root: JSCodeshiftCollection,
    correctImportPath: string
  ): void {
    // 查找现有的翻译导入
    const existingTranslationImports = root
      .find(j.ImportDeclaration)
      .filter((path: ASTPath<n.ImportDeclaration>) => {
        const sourceValue = path.node.source?.value as string;
        return sourceValue?.startsWith("@translate/");
      });

    // 检查是否已有正确的导入
    const hasCorrectImport = existingTranslationImports
      .some((path: ASTPath<n.ImportDeclaration>) => {
        return path.node.source?.value === correctImportPath;
      });

    if (hasCorrectImport) {
      return; // 已有正确导入，无需操作
    }

    // 移除所有旧的翻译导入
    existingTranslationImports.remove();

    // 添加正确的导入
    const importDecl = j.importDeclaration(
      [j.importDefaultSpecifier(j.identifier("Translations"))],
      j.literal(correctImportPath)
    );
    root.get().node.program.body.unshift(importDecl);
  }

  /**
   * 处理I18nUtil导入的统一逻辑
   */
  private handleI18nUtilImport(
    j: JSCodeshiftAPI,
    root: JSCodeshiftCollection
  ): void {
    // 检查是否已经有正确的导入
    const hasCorrectI18nUtilImport = root
      .find(j.ImportDeclaration)
      .some((path: ASTPath<n.ImportDeclaration>) => {
        const nodeSource = path.node.source;
        const nodeSpecs = path.node.specifiers;

        return !!(nodeSource?.value === "@utils/i18n" &&
          nodeSpecs?.some(spec => n.ImportSpecifier.check(spec) && spec.imported.name === "I18nUtil"));
      });

    if (hasCorrectI18nUtilImport) {
      return;
    }

    // 移除所有旧的I18nUtil导入
    root
      .find(j.ImportDeclaration)
      .filter((path: ASTPath<n.ImportDeclaration>) => {
        const nodeSource = path.node.source;
        const nodeSpecs = path.node.specifiers;
        return !!(nodeSpecs?.some(spec => n.ImportSpecifier.check(spec) && spec.imported.name === "I18nUtil"));
      })
      .remove();

    // 添加新的正确导入
    const importDecl = j.importDeclaration(
      [j.importSpecifier(j.identifier("I18nUtil"), j.identifier("I18nUtil"))],
      j.literal("@utils/i18n")
    );
    root.get().node.program.body.unshift(importDecl);
  }

  /**
   * 检查调用表达式是否是 I18n.t() 调用
   */
  private isI18nTCall(callExpr: n.CallExpression): boolean {
    const callee = callExpr.callee;

    // 检查是否是成员表达式 (I18n.t)
    if (n.MemberExpression.check(callee)) {
      const object = callee.object;
      const property = callee.property;

      // 检查对象是否是 I18n
      if (n.Identifier.check(object) && object.name === "I18n") {
        // 检查属性是否是 t
        if (n.Identifier.check(property) && property.name === "t") {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 转换字符串字面量
   */
  private transformStringLiterals(
    root: JSCodeshiftCollection,
    j: JSCodeshiftAPI,
    filePath: string,
    results: TransformResult[]
  ): void {
    root.find(j.Literal).forEach((path: ASTPath<n.Literal>) => {
      if (
        AstUtils.isStringLiteral(path.node) &&
        StringUtils.isTranslatableString(path.node.value, this.config)
      ) {
        // 跳过 import 源字符串，例如: import X from "react" / "@utils"
        let parent = path.parent;
        while (
          parent &&
          parent.node &&
          (parent.node as any).type === "Literal"
        ) {
          parent = parent.parent;
        }
        if (
          parent &&
          parent.node &&
          (parent.node as any).type === "ImportDeclaration"
        ) {
          return;
        }
        // 跳过已经位于 I18n.t(...) 调用中的字面量，避免重复包装
        if (
          parent &&
          parent.node &&
          (parent.node as any).type === "CallExpression" &&
          n.CallExpression.check(parent.node) &&
          this.isI18nTCall(parent.node as n.CallExpression)
        ) {
          return;
        }

        const formattedText = StringUtils.formatString(
          path.node.value,
          this.config
        );
        const text = StringUtils.cleanExtractedText(formattedText);
        const key = StringUtils.generateTranslationKey(filePath, text);
        results.push({ key, text });

        // 创建 I18n.t 调用表达式
        const callExpr = AstUtils.createI18nCall(key);

        // 替换节点
        this.replaceWithI18nCall(path, callExpr, j);
      }
    });
  }

  /**
   * 转换模板字符串
   */
  private transformTemplateLiterals(
    root: JSCodeshiftCollection,
    j: JSCodeshiftAPI,
    filePath: string,
    results: TransformResult[]
  ): void {
    root.find(j.TemplateLiteral).forEach((path: ASTPath<n.TemplateLiteral>) => {
      const templateResult = this.handleTemplateLiteral(path, filePath, j);
      if (templateResult) {
        results.push(templateResult.translationResult);
        this.replaceWithI18nCall(path, templateResult.callExpr, j);
      }
    });
  }

  /**
   * 转换 JSX 文本节点
   */
  private transformJSXTextNodes(
    root: JSCodeshiftCollection,
    j: JSCodeshiftAPI,
    filePath: string,
    results: TransformResult[]
  ): void {
    // 收集所有JSX元素并计算深度
    const elementPaths: Array<{ path: ASTPath<n.JSXElement>; depth: number }> = [];

    root.find(j.JSXElement).forEach((path: ASTPath<n.JSXElement>) => {
      const depth = this.getNodeDepth(path);
      elementPaths.push({ path, depth });
    });

    // 按深度排序：浅层优先（从外向内处理）
    elementPaths.sort((a, b) => a.depth - b.depth);

    // 首先处理包含混合内容的JSX元素（从外向内）
    const processedElements = new Set<n.JSXElement>();

    for (const { path } of elementPaths) {
      // 跳过已处理元素的子元素
      if (this.isChildOfProcessedElement(path, processedElements)) {
        continue;
      }

      const mixedResult = this.handleJSXMixedContent(path, filePath, j);
      if (mixedResult) {
        results.push(mixedResult.translationResult);
        // 替换整个元素的children为单个I18n调用
        const jsxExpr = AstUtils.createJSXExpressionContainer(
          mixedResult.callExpr
        );
        path.node.children = [jsxExpr];
        processedElements.add(path.node);

        // 标记所有子JSX元素为已处理，防止它们内部的文本被单独提取
        this.markAllChildElementsAsProcessed(path.node, processedElements);
      }
    }

    // 然后处理纯文本节点（跳过已经处理过的元素中的文本）
    root.find(j.JSXText).forEach((path: ASTPath<n.JSXText>) => {
      // 检查是否在已处理的元素中（检查所有祖先元素，不仅仅是直接父元素）
      let current = path.parent;
      let isInProcessedElement = false;

      while (current) {
        if (n.JSXElement.check(current.node) && processedElements.has(current.node as n.JSXElement)) {
          isInProcessedElement = true;
          break;
        }
        current = current.parent;
      }

      if (isInProcessedElement) {
        return; // 跳过已处理的元素中的文本
      }

      const textResult = this.handleJSXText(path, filePath, j);
      if (textResult) {
        results.push(textResult.translationResult);
        this.replaceWithI18nCall(path, textResult.callExpr, j);
      }
    });
  }

  /**
   * 计算AST节点的深度
   */
  private getNodeDepth(path: ASTPath<any>): number {
    let depth = 0;
    let current = path.parent;
    while (current) {
      depth++;
      current = current.parent;
    }
    return depth;
  }

  /**
   * 检查元素是否是已处理元素的子元素
   */
  private isChildOfProcessedElement(
    path: ASTPath<n.JSXElement>,
    processedElements: Set<n.JSXElement>
  ): boolean {
    let current = path.parent;
    while (current) {
      if (n.JSXElement.check(current.node) && processedElements.has(current.node as n.JSXElement)) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * 递归标记元素的所有子JSX元素为已处理
   */
  private markAllChildElementsAsProcessed(
    element: n.JSXElement,
    processedElements: Set<n.JSXElement>
  ): void {
    const children = element.children || [];
    for (const child of children) {
      if (n.JSXElement.check(child)) {
        processedElements.add(child);
        // 递归处理嵌套的子元素
        this.markAllChildElementsAsProcessed(child, processedElements);
      } else if (n.JSXExpressionContainer.check(child) && child.expression) {
        // 如果表达式容器中有JSX元素，也要标记
        if (n.JSXElement.check(child.expression)) {
          processedElements.add(child.expression);
          this.markAllChildElementsAsProcessed(child.expression, processedElements);
        }
      }
    }
  }

  /**
   * 统一的节点替换逻辑
   */
  private replaceWithI18nCall(
    path: ASTPath<n.Node>,
    callExpr: n.CallExpression,
    j: JSCodeshiftAPI
  ): void {
    const isInJSX = AstUtils.isInJSXContext(path);
    const isInJSXExpression = this.isInJSXExpression(path);

    if (isInJSX && !isInJSXExpression) {
      // 在JSX上下文中，但不在JavaScript表达式中（如JSX文本节点或属性值）
      // 需要包装为表达式容器
      const jsxExpr = AstUtils.createJSXExpressionContainer(callExpr);
      path.replace(jsxExpr);
    } else {
      // 在普通JavaScript中，或者在JSX表达式容器内的JavaScript表达式中
      // 直接替换为函数调用
      path.replace(callExpr);
    }
  }

  /**
   * 检查节点是否在JSX表达式容器内的JavaScript表达式中
   * 例如：{isLoading ? "Loading" : "Done"} 中的字符串字面量
   */
  private isInJSXExpression(path: ASTPath<n.Node>): boolean {
    let parent = path.parent;
    while (parent) {
      // 如果找到JSXExpressionContainer，说明在JS表达式中
      if (parent.node?.type === "JSXExpressionContainer") {
        return true;
      }
      // 如果遇到JSX元素或片段，但没有找到表达式容器，说明是在JSX文本或属性中
      if (
        parent.node?.type === "JSXElement" ||
        parent.node?.type === "JSXFragment"
      ) {
        return false;
      }
      parent = parent.parent;
    }
    return false;
  }

  /**
   * 处理JSX文本节点（纯文本，不需要标记符号）
   */
  private handleJSXText(
    path: ASTPath<n.JSXText>,
    filePath: string,
    j: JSCodeshiftAPI
  ): TemplateProcessResult | null {
    const node = path.node;
    const textValue = node.value;

    // 清理文本：去除前后空白字符（包括换行符），规范化内部空白
    const cleanedText = StringUtils.cleanExtractedText(textValue);

    // 如果是空字符串或只有空白字符，跳过
    if (!cleanedText) {
      return null;
    }

    // 检查是否包含英文字符，如果不包含则跳过
    if (!StringUtils.containsEnglishCharacters(cleanedText)) {
      return null;
    }

    // JSX文本节点直接处理，不需要检查标记符号
    const key = StringUtils.generateTranslationKey(filePath, cleanedText);

    // 创建 I18n.t 调用
    const callExpr = AstUtils.createI18nCall(key);

    return {
      translationResult: { key, text: cleanedText },
      callExpr,
    };
  }

  /**
   * 处理包含混合内容的JSX元素（文本 + 表达式 + JSX元素）
   * 示例：<div>~Hello {name}, <strong>welcome</strong> to <Link>site</Link>~</div>
   */
  private handleJSXMixedContent(
    path: ASTPath<n.JSXElement>,
    filePath: string,
    j: JSCodeshiftAPI
  ): TemplateProcessResult | null {
    const element = path.node;
    const children = element.children || [];

    // 检查是否包含标记的文本内容
    const hasMarkedText = children.some((child) => {
      if (n.JSXText.check(child)) {
        const textValue = child.value;
        return StringUtils.isTranslatableString(textValue, this.config) ||
               textValue.includes(this.config.startMarker) ||
               textValue.includes(this.config.endMarker);
      }
      return false;
    });

    if (!hasMarkedText) {
      return null;
    }

    // 构建完整的内容文本，检查整体是否符合翻译条件
    let fullText = "";
    for (const child of children) {
      if (n.JSXText.check(child)) {
        fullText += child.value;
      } else if (n.JSXExpressionContainer.check(child)) {
        fullText += "${var}";  // 临时占位符
      } else if (n.JSXElement.check(child)) {
        fullText += "<element/>";  // 临时占位符
      }
    }


    // 检查整体文本是否需要翻译（包含标记符号）
    // 修复：不仅检查完整标记，还要检查分布在多个节点的标记
    const startsWithMarker = fullText.trimStart().startsWith(this.config.startMarker);
    const endsWithMarker = fullText.trimEnd().endsWith(this.config.endMarker);

    if (!startsWithMarker || !endsWithMarker) {
      return null;
    }

    // 构建翻译文本和插值对象
    let translationText = "";
    const interpolationOptions: Record<string, any> = {};
    let varIndex = 0;
    let elementIndex = 0;
    let hasEnglishContent = false;

    for (const child of children) {
      if (n.JSXText.check(child)) {
        const textValue = child.value;
        // 检查文本是否包含英文字符
        if (StringUtils.containsEnglishCharacters(textValue)) {
          hasEnglishContent = true;
        }
        translationText += textValue;
      } else if (
        n.JSXExpressionContainer.check(child) &&
        child.expression &&
        !n.JSXEmptyExpression.check(child.expression)
      ) {
        // 处理变量表达式
        translationText += `%{var${varIndex}}`;
        interpolationOptions[`var${varIndex}`] = child.expression;
        varIndex++;
      } else if (n.JSXElement.check(child)) {
        // 处理JSX元素（HTML标签或React组件）- 使用平铺方式处理嵌套
        const flattenResult = this.flattenJSXElement(child, elementIndex, varIndex, j);
        translationText += flattenResult.text;

        // 检查元素内容是否包含英文
        if (!hasEnglishContent && StringUtils.containsEnglishCharacters(flattenResult.text)) {
          hasEnglishContent = true;
        }

        // 合并插值选项
        Object.assign(interpolationOptions, flattenResult.options);

        // 更新索引
        elementIndex += flattenResult.elementCount;
        varIndex += flattenResult.varCount;
      }
    }

    // 如果没有英文内容，跳过
    if (!hasEnglishContent) {
      return null;
    }


    // 应用格式化和清理（先去除标记符号，再清理空格等）
    // 对于JSX混合内容，需要特殊处理标记符号的清理
    translationText = this.cleanMixedContentMarkers(translationText, this.config);
    translationText = StringUtils.cleanExtractedText(translationText);

    if (!translationText) {
      return null;
    }

    const key = StringUtils.generateTranslationKey(filePath, translationText);

    // 构建 I18n.t 调用
    const optionsObj = Object.keys(interpolationOptions).length > 0 
      ? this.createObjectExpressionFromMap(interpolationOptions, j)
      : undefined;

    const callExpr = AstUtils.createI18nCall(key, optionsObj);

    return {
      translationResult: { key, text: translationText },
      callExpr,
    };
  }

  /**
   * 处理模板字符串（带标记符号）
   */
  private handleTemplateLiteral(
    path: ASTPath<n.TemplateLiteral>,
    filePath: string,
    j: JSCodeshiftAPI
  ): TemplateProcessResult | null {
    const node = path.node;

    // 构建模板字符串的完整文本
    const fullTemplateText = this.buildTemplateText(node);

    // 检查是否需要翻译
    if (!StringUtils.isTranslatableString(fullTemplateText, this.config)) {
      return null;
    }

    // 构建带占位符的翻译文本
    const translationText = this.buildTranslationText(node);
    const key = StringUtils.generateTranslationKey(filePath, translationText);

    // 构建 I18n.t 调用
    const callExpr = this.buildI18nCall(node, key, j);

    return {
      translationResult: { key, text: translationText },
      callExpr,
    };
  }

  /**
   * 构建模板字符串的完整文本（包含变量部分）
   */
  private buildTemplateText(node: n.TemplateLiteral): string {
    let templateText = "";
    const expressions = node.expressions || [];
    const quasis = node.quasis || [];

    for (let i = 0; i < quasis.length; i++) {
      templateText += quasis[i].value.cooked || quasis[i].value.raw;
      if (i < expressions.length) {
        // 用简单的占位符表示变量部分，用于检查是否需要翻译
        templateText += "${var}";
      }
    }

    return templateText;
  }

  /**
   * 构建用于翻译的文本（静态部分 + %{var0} 占位符）
   */
  private buildTranslationText(node: n.TemplateLiteral): string {
    const expressions = node.expressions || [];
    const quasis = node.quasis || [];
    let translationText = "";

    for (let i = 0; i < quasis.length; i++) {
      const quasiText = quasis[i].value.cooked || quasis[i].value.raw;

      // 对每个静态部分应用 format 方法
      const formattedQuasi = StringUtils.formatString(quasiText, this.config);
      translationText += formattedQuasi;

      if (i < expressions.length) {
        // 使用 %{var0} 格式以兼容现有的 handleMsg 函数
        translationText += `%{var${i}}`;
      }
    }

    // 对整体翻译文本进行清理
    return StringUtils.cleanExtractedText(translationText);
  }

  /**
   * 构建 I18n.t 调用表达式
   */
  private buildI18nCall(
    node: n.TemplateLiteral,
    key: string,
    j: JSCodeshiftAPI
  ): n.CallExpression {
    const expressions = node.expressions || [];

    // 构建选项对象，包含所有表达式变量
    let optionsObj: n.ObjectExpression | null = null;
    if (expressions.length > 0) {
      const properties = expressions.map(
        (expr: n.Expression, index: number) => {
          return AstUtils.createProperty(`var${index}`, expr);
        }
      );
      optionsObj = AstUtils.createObjectExpression(properties);
    }

    // 创建 I18n.t 调用
    return AstUtils.createI18nCall(key, optionsObj || undefined);
  }




  /**
   * 添加 scoped 初始化（统一在文件顶部添加）
   */
  private addScopedInitialization(
    j: JSCodeshiftAPI,
    root: JSCodeshiftCollection,
    translationVarName: string
  ): void {
    // 检查是否已经有 I18n scoped 初始化
    const hasExistingInit = this.hasExistingScopedInit(j, root);

    if (hasExistingInit) {
      return; // 如果已经存在，跳过添加
    }

    // 统一在文件顶部（导入语句之后）添加 I18n 初始化，使用 "Translations" 变量名
    const scopedInit = this.createScopedInitStatement(j, "Translations");
    this.insertStatementAtFileTop(j, root, scopedInit);
  }

  /**
   * 检查是否已经有 scoped 初始化
   */
  private hasExistingScopedInit(
    j: JSCodeshiftAPI,
    root: JSCodeshiftCollection
  ): boolean {
    let hasInit = false;

    root.find(j.VariableDeclarator).forEach((path) => {
      const node = path.node;
      if (
        n.Identifier.check(node.id) &&
        node.id.name === "I18n" &&
        n.CallExpression.check(node.init) &&
        n.MemberExpression.check(node.init.callee) &&
        n.Identifier.check(node.init.callee.object) &&
        node.init.callee.object.name === "I18nUtil" &&
        n.Identifier.check(node.init.callee.property) &&
        node.init.callee.property.name === "createScoped"
      ) {
        hasInit = true;
      }
    });

    return hasInit;
  }

  /**
   * 创建 scoped 初始化语句
   */
  private createScopedInitStatement(
    j: JSCodeshiftAPI,
    translationVarName: string
  ): n.VariableDeclaration {
    return j.variableDeclaration("const", [
      j.variableDeclarator(
        j.identifier("I18n"),
        j.callExpression(
          j.memberExpression(
            j.identifier("I18nUtil"),
            j.identifier("createScoped")
          ),
          [j.identifier("Translations")]
        )
      ),
    ]);
  }

  /**
   * 在文件顶部插入语句（用于非组件文件）
   */
  private insertStatementAtFileTop(
    j: JSCodeshiftAPI,
    root: JSCodeshiftCollection,
    statement: n.VariableDeclaration
  ): void {
    // 在所有导入语句之后插入
    const program = root.get().node.program;

    // 找到最后一个导入语句的位置
    let insertIndex = 0;
    for (let i = 0; i < program.body.length; i++) {
      if (n.ImportDeclaration.check(program.body[i])) {
        insertIndex = i + 1;
      } else {
        break;
      }
    }

    // 在导入语句之后插入初始化语句
    program.body.splice(insertIndex, 0, statement as any);
  }

  /**
   * 平铺JSX元素（将嵌套结构展平为同级元素）
   */
  private flattenJSXElement(
    element: n.JSXElement,
    startElementIndex: number,
    startVarIndex: number,
    j: JSCodeshiftAPI
  ): {
    text: string;
    options: Record<string, any>;
    elementCount: number;
    varCount: number;
  } {
    const options: Record<string, any> = {};
    let elementIndex = startElementIndex;
    let varIndex = startVarIndex;
    
    // 处理当前元素的内容
    const contentResult = this.extractElementContentFlat(element, varIndex);
    const elementContent = contentResult.text;
    varIndex += contentResult.varCount;
    
    // 合并内容中的变量选项
    Object.assign(options, contentResult.options);
    
    // 创建当前元素的工厂
    options[`el${elementIndex}`] = this.createElementFactory(element, j);
    
    // 生成元素的占位符文本
    const text = elementContent 
      ? `<el${elementIndex}>${elementContent}</el${elementIndex}>`
      : `<el${elementIndex}/>`;
    
    return {
      text,
      options,
      elementCount: 1,
      varCount: contentResult.varCount
    };
  }

  /**
   * 提取元素内容（平铺方式，不递归处理嵌套元素）
   */
  private extractElementContentFlat(
    element: n.JSXElement,
    startVarIndex: number
  ): {
    text: string;
    options: Record<string, any>;
    varCount: number;
  } {
    let textContent = "";
    const options: Record<string, any> = {};
    let varIndex = startVarIndex;
    const children = element.children || [];
    
    for (const child of children) {
      if (n.JSXText.check(child)) {
        textContent += child.value;
      } else if (n.JSXExpressionContainer.check(child)) {
        // 变量表达式
        textContent += `%{var${varIndex}}`;
        options[`var${varIndex}`] = child.expression;
        varIndex++;
      } else if (n.JSXElement.check(child)) {
        // 嵌套元素：这里不递归，而是将其视为占位符
        // 这意味着嵌套结构会被简化
        textContent += `<nested-element/>`;
      }
    }
    
    return {
      text: StringUtils.cleanExtractedText(textContent),
      options,
      varCount: varIndex - startVarIndex
    };
  }

  /**
   * 创建元素工厂函数
   */
  private createElementFactory(element: n.JSXElement, j: JSCodeshiftAPI): n.ArrowFunctionExpression {
    const hasTextContent = this.hasTextChildren(element);
    const jsxElement = this.createJSXElementWithDynamicText(element, hasTextContent, j);

    return hasTextContent
      ? j.arrowFunctionExpression([j.identifier('text')], jsxElement)
      : j.arrowFunctionExpression([], jsxElement);
  }

  /**
   * 创建带有动态文本的JSX元素
   */
  private createJSXElementWithDynamicText(
    originalElement: n.JSXElement, 
    hasTextContent: boolean, 
    j: JSCodeshiftAPI
  ): n.JSXElement {
    const elementName = this.getElementName(originalElement);
    const attributes = originalElement.openingElement.attributes || [];
    
    // 创建开始标签
    const openingElement = j.jsxOpeningElement(
      j.jsxIdentifier(elementName),
      attributes
    );
    
    // 如果是自闭合标签（无文本内容），设置selfClosing为true
    if (!hasTextContent) {
      openingElement.selfClosing = true;
      return j.jsxElement(openingElement, null, []);
    }
    
    // 创建结束标签
    const closingElement = j.jsxClosingElement(j.jsxIdentifier(elementName));
    
    // 子元素：{text} 表达式
    const children = [j.jsxExpressionContainer(j.identifier('text'))];
    
    return j.jsxElement(openingElement, closingElement, children);
  }

  /**
   * 获取JSX元素名称
   */
  private getElementName(element: n.JSXElement): string {
    const name = element.openingElement.name;
    if (n.JSXIdentifier.check(name)) {
      return name.name;
    }
    // 处理JSXMemberExpression等复杂情况
    return 'div'; // 默认fallback
  }


  /**
   * 检查元素是否有文本子节点
   */
  private hasTextChildren(element: n.JSXElement): boolean {
    const children = element.children || [];
    return children.some(child => 
      n.JSXText.check(child) && child.value.trim() ||
      n.JSXExpressionContainer.check(child) ||
      n.JSXElement.check(child)
    );
  }

  /**
   * 通用的对象表达式创建工具
   */
  private createObjectExpressionFromMap(
    options: Record<string, any>, 
    j: JSCodeshiftAPI
  ): n.ObjectExpression {
    const properties: n.Property[] = [];
    
    for (const [key, value] of Object.entries(options)) {
      if (n.Node.check(value)) {
        // AST节点
        properties.push(j.property('init', j.identifier(key), value as any));
      } else if (n.ArrowFunctionExpression.check(value) || typeof value === 'function') {
        // 函数
        properties.push(j.property('init', j.identifier(key), value as any));
      } else if (value === null) {
        // 布尔属性
        properties.push(j.property('init', j.identifier(key), j.literal(true)));
      } else {
        // 其他字面值
        properties.push(j.property('init', j.identifier(key), j.literal(value)));
      }
    }
    
    return j.objectExpression(properties);
  }

  /**
   * 清理JSX混合内容中的标记符号
   * 专门处理标记符号可能分布在文本中任意位置的情况
   */
  private cleanMixedContentMarkers(text: string, config: I18nConfig): string {
    const { startMarker, endMarker } = config;
    
    // 转义特殊字符用于正则表达式
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 移除开始标记符号（可能在任意位置，但通常在开头附近）
    let cleaned = text.replace(new RegExp(escapeRegex(startMarker), 'g'), '');
    
    // 移除结束标记符号（可能在任意位置，但通常在结尾附近）
    cleaned = cleaned.replace(new RegExp(escapeRegex(endMarker), 'g'), '');
    
    return cleaned;
  }
}

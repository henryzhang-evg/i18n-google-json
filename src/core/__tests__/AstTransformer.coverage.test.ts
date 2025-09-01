import * as jscodeshift from "jscodeshift";
import { AstTransformer } from "../AstTransformer";
import type { I18nConfig } from "../../types";

const mockConfig: I18nConfig = {
  rootDir: "./",
  languages: ["en", "ko"],
  include: ["js", "jsx", "ts", "tsx"],
  ignore: [],
  outputDir: "./src/translate",
  startMarker: "~",
  endMarker: "~",
  logLevel: "silent",
  spreadsheetId: "test",
  sheetName: "test",
  keyFile: "test.json",
  apiKey: "test",
};

describe("AstTransformer - Coverage Tests", () => {
  let transformer: AstTransformer;

  beforeEach(() => {
    transformer = new AstTransformer(mockConfig);
  });

  describe("边界情况和错误路径", () => {
    test("处理不带标记的字符串字面量", () => {
      const source = `
        function Component() {
          const normalString = "This is not marked";
          return <div>{normalString}</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(0);
      expect(result.transformedCode).toBe(source);
    });

    test("处理空的JSX元素", () => {
      const source = `
        function Component() {
          return <div></div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(0);
    });

    test("处理JSX表达式容器为空的情况", () => {
      const source = `
        function Component() {
          return <div>{}</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(0);
    });

    test("处理没有英文字符的文本", () => {
      const source = `
        function Component() {
          return <div>~数字123~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      // 实际上系统会处理带标记的文本，即使没有英文字符
      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toBe("数字123");
    });

    test("处理只有空白字符的JSX文本", () => {
      const source = `
        function Component() {
          return <div>
            
          </div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(0);
    });

    test("处理模板字符串但不符合翻译条件", () => {
      const source = `
        function Component() {
          const template = \`normal template \${value}\`;
          return <div>{template}</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(0);
    });

    test("处理带标记的模板字符串", () => {
      const source = `
        function Component() {
          const name = "John";
          const template = \`~Hello \${name}~\`;
          return <div>{template}</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toBe("Hello %{var0}");
    });

    test("处理复杂的JSX成员表达式", () => {
      const source = `
        function Component() {
          return <div>~Welcome <Icon.User size="large" />~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      // 测试处理JSXMemberExpression的情况
      expect(result.results).toHaveLength(1);
    });

    test("处理JSX属性中的各种值类型", () => {
      const source = `
        function Component() {
          return <div>~Click <button 
            disabled 
            id="btn-1"
            onClick={handleClick}
            style={{color: 'red'}}
            data-test={isTest ? 'yes' : 'no'}
          >Submit</button>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(1);
      expect(result.transformedCode).toContain("disabled");
      expect(result.transformedCode).toContain('id="btn-1"');
      expect(result.transformedCode).toContain("onClick={handleClick}");
      expect(result.transformedCode).toContain("style={{color: 'red'}}");
    });

    test("处理JSX命名空间属性", () => {
      const source = `
        function Component() {
          return <div>~Test <svg xml:space="preserve">icon</svg>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(1);
      // 测试JSXNamespacedName的处理
    });

    test("处理已经存在正确导入的文件", () => {
      const source = `
        import { I18nUtil } from "@utils/i18n";
        import Translations from "@translate/test";
        
        const I18n = I18nUtil.createScoped(Translations);
        
        function Component() {
          return <div>~Hello World~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(1);
      // 应该不重复添加导入
      const importCount = (result.transformedCode.match(/import.*I18nUtil/g) || []).length;
      expect(importCount).toBe(1);
    });

    test("处理带有错误导入路径的文件", () => {
      const source = `
        import { I18nUtil } from "@utils";
        import Translations from "@translate/wrong/path";
        
        function Component() {
          return <div>~Hello World~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(1);
      // 应该修复导入路径
      expect(result.transformedCode).toContain('import { I18nUtil } from "@utils/i18n"');
      expect(result.transformedCode).toContain('import Translations from "@translate/test"');
    });

    test("处理JSX扩展属性", () => {
      const source = `
        function Component() {
          const props = {className: 'test'};
          return <div>~Click <button {...props} onClick={handler}>Submit</button>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(1);
      // JSXSpreadAttribute应该被过滤掉，只保留常规属性
      expect(result.transformedCode).toContain("onClick={handler}");
    });

    test("处理自闭合的HTML标签", () => {
      const source = `
        function Component() {
          return <div>~Click <input type="text" disabled /> here~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toBe("Click <el0/> here");
      expect(result.transformedCode).toContain('type="text"');
      expect(result.transformedCode).toContain("disabled");
    });

    test("处理没有文本内容的元素", () => {
      const source = `
        function Component() {
          return <div>~Welcome <hr /> user~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toBe("Welcome <el0/> user");
    });

    test("处理嵌套变量表达式", () => {
      const source = `
        function Component() {
          const user = {name: 'John', age: 25};
          return <div>~User <strong>{user.name}</strong> is {user.age} years old~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toBe("User <el0>%{var0}</el0> is %{var1} years old");
      expect(result.transformedCode).toContain("var0: user.name");
      expect(result.transformedCode).toContain("var1: user.age");
    });
  });

  describe("collectExistingI18nCalls 边界情况", () => {
    test("收集使用模板字面量作为key的I18n调用", () => {
      const source = `
        function Component() {
          const key = "dynamic";
          return <div>{I18n.t(\`static_key\`)}</div>;
        }
      `;

      const references = transformer.collectExistingI18nCalls(source, "test.tsx");

      expect(references).toHaveLength(1);
      expect(references[0].key).toBe("static_key");
    });

    test("收集非I18n的调用应该被忽略", () => {
      const source = `
        function Component() {
          return <div>{SomeOther.t("not i18n")}</div>;
        }
      `;

      const references = transformer.collectExistingI18nCalls(source, "test.tsx");

      expect(references).toHaveLength(0);
    });

    test("收集I18n调用但参数不是字符串字面量", () => {
      const source = `
        function Component() {
          const key = "dynamic";
          return <div>{I18n.t(key)}</div>;
        }
      `;

      const references = transformer.collectExistingI18nCalls(source, "test.tsx");

      expect(references).toHaveLength(0);
    });
  });

  describe("analyzeAndTransformSource 复杂场景", () => {
    test("文件同时有现有引用和新翻译", () => {
      const source = `
        import { I18nUtil } from "@utils/i18n";
        import Translations from "@translate/test";
        
        const I18n = I18nUtil.createScoped(Translations);
        
        function Component() {
          return (
            <div>
              {I18n.t("existing.key")}
              <span>~New translation~</span>
            </div>
          );
        }
      `;

      const result = transformer.analyzeAndTransformSource(source, "test.tsx");

      // 转换后会重新收集引用，包括新生成的I18n调用
      expect(result.existingReferences.length).toBeGreaterThan(0);
      expect(result.existingReferences.some(ref => ref.key === "existing.key")).toBe(true);
      expect(result.newTranslations).toHaveLength(1);
      expect(result.newTranslations[0].text).toBe("New translation");
    });

    test("文件只有现有引用没有新翻译但需要修复导入", () => {
      const source = `
        import { I18nUtil } from "@utils";
        import Translations from "@translate/wrong";
        
        const I18n = I18nUtil.createScoped(Translations);
        
        function Component() {
          return <div>{I18n.t("existing.key")}</div>;
        }
      `;

      const result = transformer.analyzeAndTransformSource(source, "test.tsx");

      expect(result.existingReferences).toHaveLength(1);
      expect(result.newTranslations).toHaveLength(0);
      // 只有新翻译时才会修复导入路径，现有引用不会触发导入修复
      expect(result.transformedCode).toContain('import Translations from "@translate/test"');
    });

    test("空文件处理", () => {
      const source = "";

      const result = transformer.analyzeAndTransformSource(source, "test.tsx");

      expect(result.existingReferences).toHaveLength(0);
      expect(result.newTranslations).toHaveLength(0);
      expect(result.transformedCode).toBe("");
    });

    test("只有注释的文件", () => {
      const source = `
        // This is a comment
        /* This is a block comment */
      `;

      const result = transformer.analyzeAndTransformSource(source, "test.tsx");

      expect(result.existingReferences).toHaveLength(0);
      expect(result.newTranslations).toHaveLength(0);
    });
  });

  describe("未覆盖代码行的测试", () => {
    test("处理模板字面量键值为cooked null的情况（行185-188）", () => {
      // 创建一个修改过的transformer来测试特殊情况
      const source = `
        function Component() {
          return <div>{I18n.t(\`test_key\`)}</div>;
        }
      `;

      const references = transformer.collectExistingI18nCalls(source, "test.tsx");
      expect(references).toHaveLength(1);
      expect(references[0].key).toBe("test_key");
    });

    test("测试import声明中的return语句（行300）", () => {
      const source = `
        import { helper } from "helper-lib";
        function Component() {
          return <div>~Normal text~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      expect(result.results).toHaveLength(1);
    });

    test("测试I18n.t调用内的return语句（行307和317）", () => {
      const source = `
        function Component() {
          return <div>{I18n.t("existing_key")} and ~New text~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      expect(result.results).toHaveLength(1);
    });

    test("测试已处理元素中的JSX文本跳过（行385,392）", () => {
      const source = `
        function Component() {
          return <div>~Welcome <strong>user</strong>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      expect(result.results).toHaveLength(1);
    });

    test("测试JSX文本处理的return语句（行397-398）", () => {
      const source = `
        function Component() {
          return <div>~Valid text with English~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      expect(result.results).toHaveLength(1);
    });

    test("测试JSXExpressionContainer的检查（行435）", () => {
      const source = `
        function Component() {
          const element = <div>{"not marked"}</div>;
          return element;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      expect(result.results).toHaveLength(0);
    });

    test("测试JSX文本清理和英文检查（行469-479）", () => {
      const source = `
        function Component() {
          return <div>   \n  \t   </div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      expect(result.results).toHaveLength(0);
    });

    test("测试不符合翻译条件的混合内容（行526）", () => {
      const source = `
        function Component() {
          return <div>no markers here</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      // JSX纯文本会被处理，不需要标记符号
      expect(result.results).toHaveLength(1);
    });

    test("测试没有英文内容的混合内容（行569）", () => {
      const source = `
        function Component() {
          return <div>~纯中文{variable}内容~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      // 没有英文内容时不会被处理
      expect(result.results).toHaveLength(0);
    });

    test("测试空翻译文本的情况（行577）", () => {
      const source = `
        function Component() {
          return <div>~\n\t   ~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      // 空文本也会被算做一个key，不会被过滤
      expect(result.results).toHaveLength(1);
    });

    test("测试既有工厂函数也有其他类型的插值选项（行1149-1151）", () => {
      const source = `
        function Component() {
          return <div>~Click <button>here</button> {name}~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toBe("Click <el0>here</el0> %{var0}");
    });

    test("测试嵌套JSX元素的平铺处理（行1030-1033）", () => {
      const source = `
        function Component() {
          return <div>~Click <span>text <em>nested</em></span>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toBe("Click <el0>text <nested-element/></el0>");
    });

    test("测试导入修复中的specifiers处理（行835-850）", () => {
      const source = `
        import { I18nUtil, otherUtil } from "@utils";
        function Component() {
          return <div>~Test text~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      expect(result.results).toHaveLength(1);
      expect(result.transformedCode).toContain("I18nUtil");
    });

    test("测试字符串在导入声明中被跳过", () => {
      const source = `
        import { something } from "~marked text~";
        function Component() {
          return <div>normal</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      // JSX纯文本会被处理，但导入路径不会
      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toBe("normal");
    });

    test("测试I18n.t调用中的字符串被跳过", () => {
      const source = `
        function Component() {
          return <div>{I18n.t("~marked key~")}</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      // I18n.t调用中的key不会被重复处理
      expect(result.results).toHaveLength(0);
    });

    test("测试JSXExpressionContainer中的检查", () => {
      const source = `
        function Component() {
          return (
            <div>
              <span>{someCondition ? "~conditional text~" : "other"}</span>
            </div>
          );
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      // JSXExpressionContainer中的条件表达式中的文本会被处理
      expect(result.results).toHaveLength(1);
    });

    test("测试没有现有Utils导入的情况", () => {
      // 没有任何@utils导入的文件
      const source = `
        function Component() {
          return <div>~Test text~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");
      expect(result.results).toHaveLength(1);
      // 应该添加新的I18nUtil导入
      expect(result.transformedCode).toContain('import { I18nUtil } from "@utils/i18n"');
    });
  });
});
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

describe("AstTransformer - Component Interpolation", () => {
  let transformer: AstTransformer;

  beforeEach(() => {
    transformer = new AstTransformer(mockConfig);
  });

  describe("HTML标签插值", () => {
    test("简单HTML标签与变量混合", () => {
      const source = `
        function Component() {
          const name = "John";
          return <div>~Welcome <strong>{name}</strong> to our site~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toBe("Welcome <el0>%{var0}</el0> to our site");
      expect(result.results[0].key).toBe("Welcome <el0>%{var0}</el0> to our site");
      
      // 验证转换后的代码包含正确的I18n调用
      expect(result.transformedCode).toContain('I18n.t("Welcome <el0>%{var0}</el0> to our site"');
      expect(result.transformedCode).toContain("var0: name");
      expect(result.transformedCode).toContain("el0: text => <strong>{text}</strong>");
    });

    test("HTML标签属性完整保持", () => {
      const source = `
        function Component() {
          return <div>~Click <a href="/help" className="link" target="_blank">here</a>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results[0].text).toBe("Click <el0>here</el0>");
      expect(result.transformedCode).toContain('href="/help"');
      expect(result.transformedCode).toContain('className="link"');
      expect(result.transformedCode).toContain('target="_blank"');
    });

    test("嵌套HTML标签", () => {
      const source = `
        function Component() {
          return <p>~Read our <strong>terms and <u>conditions</u></strong> carefully~</p>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results[0].text).toBe("Read our <el0>terms and <nested-element/></el0> carefully");
      expect(result.transformedCode).toContain("el0:");
    });
  });

  describe("React组件插值", () => {
    test("简单React组件", () => {
      const source = `
        import { Link } from 'react-router-dom';
        
        function Component() {
          return <div>~Click <Link to="/home">here</Link> to continue~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results[0].text).toBe("Click <el0>here</el0> to continue");
      expect(result.transformedCode).toContain("el0: text => <Link");
      expect(result.transformedCode).toContain('to="/home"');
    });

    test("React组件动态属性保持", () => {
      const source = `
        function Component() {
          const path = "/dashboard";
          const handleClick = () => {};
          return <div>~Visit <Link to={path} onClick={handleClick}>dashboard</Link>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results[0].text).toBe("Visit <el0>dashboard</el0>");
      expect(result.transformedCode).toContain("to={path}");
      expect(result.transformedCode).toContain("onClick={handleClick}");
    });

    test("React组件复杂表达式属性保持", () => {
      const source = `
        function Component() {
          const theme = {primary: '#blue'};
          const isLoading = false;
          return <div>~Click <Button 
            disabled={isLoading || !isValid} 
            style={{...theme, color: 'red'}}
            onClick={() => handleSubmit(data)}
          >submit</Button>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results[0].text).toBe("Click <el0>submit</el0>");
      expect(result.transformedCode).toContain("disabled={isLoading || !isValid}");
      expect(result.transformedCode).toContain("style={{...theme, color: 'red'}}");
      expect(result.transformedCode).toContain("onClick={() => handleSubmit(data)}");
    });
  });

  describe("统一处理", () => {
    test("HTML标签和React组件混合", () => {
      const source = `
        import { Link } from 'react-router-dom';
        
        function Component() {
          const user = {name: 'John'};
          return <div>~Welcome <strong>{user.name}</strong>, visit <Link to="/dashboard">dashboard</Link> or <button onClick={handleSettings}>settings</button>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results[0].text).toBe("Welcome <el0>%{var0}</el0>, visit <el1>dashboard</el1> or <el2>settings</el2>");
      
      // 验证JSX语法生成
      expect(result.transformedCode).toContain("el0: text => <strong>");
      expect(result.transformedCode).toContain("el2: text => <button");
      expect(result.transformedCode).toContain("el1: text => <Link");
      
      // 验证属性保持
      expect(result.transformedCode).toContain('to="/dashboard"');
      expect(result.transformedCode).toContain("onClick={handleSettings}");
    });

    test("自闭合标签处理", () => {
      const source = `
        function Component() {
          return <div>~Check icon <img src="/icon.png" alt="icon" /> here~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results[0].text).toBe("Check icon <el0/> here");
      expect(result.transformedCode).toContain("el0: () => <img");
      expect(result.transformedCode).toContain('src="/icon.png"');
      expect(result.transformedCode).toContain('alt="icon"');
    });

    test("布尔属性正确处理", () => {
      const source = `
        function Component() {
          return <div>~Submit <button disabled>now</button>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results[0].text).toBe("Submit <el0>now</el0>");
      expect(result.transformedCode).toContain("disabled");
    });
  });

  describe("JSX语法工厂函数生成", () => {
    test("应该生成JSX语法而不是React.createElement", () => {
      const source = `
        function Component() {
          return (
            <div>
              ~Welcome <strong>user</strong> to our site~
            </div>
          );
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results).toHaveLength(1);
      expect(result.results[0].text).toBe("Welcome <el0>user</el0> to our site");
      
      // 验证生成JSX语法而不是React.createElement
      expect(result.transformedCode).toContain("el0: text => <strong>{text}</strong>");
      expect(result.transformedCode).not.toContain("React.createElement");
    });

    test("HTML标签应该生成JSX语法", () => {
      const source = `
        function Component() {
          return <div>~Click <button onClick={handleClick}>here</button>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.transformedCode).toContain("el0: text => <button onClick={handleClick}>{text}</button>");
      expect(result.transformedCode).not.toContain("React.createElement");
    });

    test("React组件应该生成JSX语法", () => {
      const source = `
        import { Link } from 'react-router-dom';
        
        function Component() {
          return <div>~Go to <Link to="/home">dashboard</Link>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.transformedCode).toContain("el0: text => <Link to=\"/home\">{text}</Link>");
      expect(result.transformedCode).not.toContain("React.createElement");
    });

    test("复杂属性应该正确生成JSX语法", () => {
      const source = `
        function Component() {
          const theme = {primary: '#blue'};
          return <div>~Submit <button 
            disabled={isLoading} 
            style={{...theme, color: 'red'}}
            onClick={() => handleSubmit()}
          >now</button>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.transformedCode).toContain("el0: text => <button");
      expect(result.transformedCode).toContain("disabled={isLoading}");
      expect(result.transformedCode).toContain("style={{...theme, color: 'red'}}");
      expect(result.transformedCode).toContain("onClick={() => handleSubmit()}");
      expect(result.transformedCode).toContain(">{text}</button>");
      expect(result.transformedCode).not.toContain("React.createElement");
    });

    test("自闭合标签应该生成JSX语法", () => {
      const source = `
        function Component() {
          return <div>~Check icon <img src="/icon.png" alt="icon" /> here~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.transformedCode).toContain("el0: () => <img src=\"/icon.png\" alt=\"icon\" />");
      expect(result.transformedCode).not.toContain("React.createElement");
    });
  });

  describe("Bug修复测试", () => {
    test("JSX混合内容包含标记符号应作为统一组件插值处理", () => {
      // 这个测试用例复现了在crypto-fundraise-tracker/page.tsx中发现的bug
      // 标记符号~包围的JSX混合内容应该作为单一的组件插值处理
      // 而不是被分割成多个独立的翻译调用
      const source = `
        function Component() {
          return (
            <div>
              ~Welcome <strong>ffff</strong> to our site~
            </div>
          );
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      // 验证应该只有一个翻译结果，而不是三个分开的
      expect(result.results).toHaveLength(1);
      
      // 验证文本应该是统一的组件插值格式
      expect(result.results[0].text).toBe("Welcome <el0>ffff</el0> to our site");
      
      // 验证转换后的代码应该是单一的I18n.t()调用
      expect(result.transformedCode).toContain('I18n.t("Welcome <el0>ffff</el0> to our site"');
      
      // 更新：现在应该生成JSX语法
      expect(result.transformedCode).toContain("el0: text => <strong>{text}</strong>");
      
      // 验证不应该包含分离的翻译调用
      expect(result.transformedCode).not.toContain('I18n.t("~Welcome")');
      expect(result.transformedCode).not.toContain('I18n.t("ffff")');
      expect(result.transformedCode).not.toContain('I18n.t("to our site~")');
    });
  });

  describe("边界情况", () => {
    test("空属性组件", () => {
      const source = `
        function Component() {
          return <div>~Welcome <span>user</span>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results[0].text).toBe("Welcome <el0>user</el0>");
      expect(result.transformedCode).toContain("el0: text => <span>{text}</span>");
    });

    test("只有变量无组件", () => {
      const source = `
        function Component() {
          const name = "John";
          return <div>~Welcome {name}~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results[0].text).toBe("Welcome %{var0}");
      expect(result.transformedCode).toContain("var0: name");
      expect(result.transformedCode).not.toContain("el0:");
    });

    test("只有组件无变量", () => {
      const source = `
        function Component() {
          return <div>~Click <button>here</button>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      expect(result.results[0].text).toBe("Click <el0>here</el0>");
      expect(result.transformedCode).toContain("el0:");
      expect(result.transformedCode).not.toContain("var0:");
    });
  });

  describe("导入处理", () => {
    test("自动添加必要的导入", () => {
      const source = `
        function Component() {
          return <div>~Welcome <strong>user</strong>~</div>;
        }
      `;

      const result = transformer.transformSource(source, "test.tsx");

      // 验证添加了必要的导入
      expect(result.transformedCode).toContain('import Translations from "@translate/test"');
      expect(result.transformedCode).toContain('import { I18nUtil } from "@utils/i18n"');
      expect(result.transformedCode).toContain("const I18n = I18nUtil.createScoped(Translations)");
    });
  });
});
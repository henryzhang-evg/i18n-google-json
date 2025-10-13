# 更新日志

本项目的所有重要更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.3] - 未发布

### 新增
- **npm 自动更新提醒功能**
  - 集成 update-notifier 实现版本检查
  - 每 24 小时自动检查一次 npm 仓库更新
  - 后台异步执行，不影响工具性能
  - 支持 `NO_UPDATE_NOTIFIER` 环境变量禁用
  - 网络错误静默处理，不干扰正常使用
  - 新增 UpdateNotifier 工具类，100% 测试覆盖率

### 变更
- **术语匹配逻辑完全重新设计**
  - 从翻译后正则匹配改为翻译前精确匹配
  - 术语匹配现在在调用 LLM 翻译之前检查是否完全匹配
  - 精确匹配到术语时跳过 LLM API 调用（性能优化）
  - 新增 `isTermInGlossary()` 和 `getTermTranslation()` 辅助函数
  - `translateWithGlossary()` 优先使用术语表精确匹配，再回退到 LLM 翻译

### 修复
- **改进跨 JSX 元素翻译处理**
  - 实现深度优先 JSX 元素处理，正确处理嵌套标记
  - 修复跨元素标记提取的边缘情况
  - 改进 GoogleSheetsSync 异步初始化处理

### 测试
- 新增跨模块污染测试套件（294 行）
- 新增术语匹配逻辑测试（182 行）
- 新增跨 JSX 元素翻译测试（159 行）
- 新增 UpdateNotifier 测试（117 行，100% 覆盖率）
- 确保翻译键只在对应模块路径匹配时才标记为已使用

### 废弃
- `GlossaryManager.applyGlossary()` 方法 - 已被新的翻译前精确匹配逻辑替代

## [0.3.2] - 2024-08-29

### 新增
- **组件插值功能**
  - 智能处理 JSX 混合内容翻译（如 `~Hello <strong>{name}</strong>~`）
  - 支持复杂的组件嵌套和变量插值场景
  - 新增 368 行组件插值测试，确保功能稳定性

- **术语表集成**
  - 新增 GlossaryManager，支持 Google Sheets 术语表自动应用
  - 术语表缓存机制（5 分钟 TTL）
  - 新增 318 行 GlossaryManager 测试

- **LLM 翻译增强**
  - 添加重试机制和超时控制
  - 温度参数配置支持
  - 新增 276 行 LLM 翻译测试

### 变更
- **AstTransformer 重构**
  - 减少 37% 冗余代码
  - 统一导入管理，自动修复导入路径
  - AST 解析优化，避免重复解析
  - 新增 590 行覆盖率测试（95%+ 覆盖率）

- **统一 Google Sheets 客户端**
  - 新增 GoogleSheetsClient 工具类
  - 减少重复代码，简化集成
  - 多级降级错误处理机制

### 改进
- 智能导入管理，减少手动维护
- 模块化测试架构
- TDD 开发流程，新功能 100% 测试覆盖

## [0.3.1] - 2024-XX-XX

### 修复
- **修复共享 Key 在多模块中的翻译记录生成问题**
  - 修复当多个模块使用相同 translation key 时，部分模块无法生成翻译记录的问题
  - 确保共享 key 在所有使用它的模块中都创建翻译记录
  - 保持向后兼容性，原始模块的翻译记录依然保留
  - 修改 `TranslationManager.buildCompleteRecord()` 中的共享 key 处理逻辑

### 测试
- 新增 comprehensive shared-key-issue.test.ts 测试套件（237 行）
- 验证多模块共享 key 场景、路径分类逻辑和优先级处理

## [0.3.0] - 2024-XX-XX

### 新增
- **依赖注入式用户交互系统**
  - 新增 IUserInteraction、AutoInteraction、InquirerInteractionAdapter 接口
  - I18nScanner 和 DeleteService 集成新交互系统
  - 测试/CI 环境自动跳过确认提示

- **稳定 CompleteRecord 输出顺序**
  - 模块路径与翻译键按字典序排序
  - 语言字段按配置顺序，mark 字段始终最后
  - 确保无内容变化的二次扫描中 i18n-complete-record.json 顺序稳定

- **KeyFormat 工具类**
  - 在 PreviewFileService 和 GoogleSheetsSync 中使用
  - 统一键格式化逻辑

### 改进
- **类型安全增强**
  - 改进错误处理机制并增加 I18nError 类型安全
  - 修复 I18nScanner 和 ProgressIndicator 的类型定义

- **测试增强**
  - 新增 stable-ordering 测试
  - 新增 FileTransformer.unit、PreviewFileService.unit、TranslationManager.unit 测试
  - 新增 module-path-key-unused-detection.test.ts（196 行）
  - 补充 AstTransformer 与模块路径未使用键检测用例

### 修复
- ProgressIndicator：Jest 环境不加载 ora，避免 teardown 异常
- mark 字段位置变化问题
- FileTransformer 与相关模块重构与日志优化

---

## 版本历史

- **[0.3.3]** - 术语匹配重新设计 + npm 更新提醒 + 跨 JSX 元素翻译改进
- **[0.3.2]** - 组件插值 + 术语表集成 + LLM 增强 + AstTransformer 重构
- **[0.3.1]** - 修复共享 Key 多模块翻译记录问题
- **[0.3.0]** - 用户交互系统重构 + CompleteRecord 排序稳定 + 类型安全增强

[0.3.3]: https://github.com/947776795/i18n-google/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/947776795/i18n-google/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/947776795/i18n-google/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/947776795/i18n-google/compare/v0.2.23...v0.3.0

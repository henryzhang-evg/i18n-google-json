import updateNotifier from "update-notifier";
import * as path from "path";

/**
 * 检查并通知用户有可用的包更新
 *
 * 功能说明:
 * - 检查 npm 仓库中是否有新版本
 * - 在后台异步执行,不阻塞主进程
 * - 使用缓存机制,默认每 24 小时检查一次
 * - 支持通过 NO_UPDATE_NOTIFIER 环境变量禁用
 *
 * 用户可以通过以下方式禁用更新通知:
 * - 设置环境变量: NO_UPDATE_NOTIFIER=1
 * - 或在 ~/.config/configstore/update-notifier-i18n-google.json 中设置 optOut: true
 */
export function checkForUpdates(): void {
  try {
    // 检查是否通过环境变量禁用了更新通知
    if (process.env.NO_UPDATE_NOTIFIER) {
      return;
    }

    // 读取 package.json
    const packageJsonPath = path.join(__dirname, "../../package.json");
    const pkg = require(packageJsonPath);

    // 配置更新通知器
    const notifier = updateNotifier({
      pkg,
      updateCheckInterval: 1000 * 60 * 60 * 24, // 24 小时检查一次
    });

    // 如果有可用更新,显示通知
    // notify() 方法会自动处理显示逻辑,包括检查间隔等
    notifier.notify({
      isGlobal: true,
      defer: false,
    });
  } catch (error) {
    // 静默失败,不影响主程序运行
    // 更新检查失败不应该导致工具无法使用
  }
}

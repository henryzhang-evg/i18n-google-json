// Mock update-notifier 模块 (必须在 import 之前)
const mockNotify = jest.fn();
const mockUpdateNotifier = jest.fn();

jest.mock("update-notifier", () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { checkForUpdates } from "../UpdateNotifier";
import updateNotifier from "update-notifier";

describe("UpdateNotifier", () => {
  const mockedUpdateNotifier = updateNotifier as jest.MockedFunction<
    typeof updateNotifier
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    // 清除环境变量
    delete process.env.NO_UPDATE_NOTIFIER;
  });

  describe("checkForUpdates", () => {
    it("应该在没有可用更新时调用 notify", () => {
      mockedUpdateNotifier.mockReturnValue({
        update: undefined,
        notify: mockNotify,
      } as any);

      checkForUpdates();

      expect(mockedUpdateNotifier).toHaveBeenCalledWith(
        expect.objectContaining({
          pkg: expect.objectContaining({
            name: "i18n-google",
          }),
          updateCheckInterval: 1000 * 60 * 60 * 24, // 24小时
        })
      );
      expect(mockNotify).toHaveBeenCalledWith({
        isGlobal: true,
        defer: false,
      });
    });

    it("应该在有可用更新时显示通知", () => {
      mockedUpdateNotifier.mockReturnValue({
        update: {
          latest: "1.0.0",
          current: "0.9.0",
          type: "minor",
          name: "i18n-google",
        },
        notify: mockNotify,
      } as any);

      checkForUpdates();

      expect(mockNotify).toHaveBeenCalledWith({
        isGlobal: true,
        defer: false,
      });
    });

    it("应该在设置 NO_UPDATE_NOTIFIER 环境变量时跳过检查", () => {
      process.env.NO_UPDATE_NOTIFIER = "1";

      checkForUpdates();

      expect(mockedUpdateNotifier).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("应该优雅处理错误情况", () => {
      mockedUpdateNotifier.mockImplementation(() => {
        throw new Error("Network error");
      });

      // 不应该抛出错误
      expect(() => checkForUpdates()).not.toThrow();
    });

    it("应该使用正确的更新检查间隔(24小时)", () => {
      mockedUpdateNotifier.mockReturnValue({
        update: undefined,
        notify: mockNotify,
      } as any);

      checkForUpdates();

      expect(mockedUpdateNotifier).toHaveBeenCalledWith(
        expect.objectContaining({
          updateCheckInterval: 86400000, // 24 * 60 * 60 * 1000
        })
      );
    });

    it("应该传递正确的包信息给 update-notifier", () => {
      mockedUpdateNotifier.mockReturnValue({
        update: undefined,
        notify: mockNotify,
      } as any);

      checkForUpdates();

      expect(mockedUpdateNotifier).toHaveBeenCalledWith(
        expect.objectContaining({
          pkg: expect.objectContaining({
            name: "i18n-google",
            version: expect.any(String),
          }),
        })
      );
    });
  });
});

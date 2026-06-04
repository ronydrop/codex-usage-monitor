import { describe, expect, it, vi } from "vitest";
import { hideWindowToTray, showWindowFromTray } from "../main/window-visibility";

describe("window visibility", () => {
  it("shows the main window without adding it to the taskbar", () => {
    const window = {
      setBounds: vi.fn(),
      setSkipTaskbar: vi.fn(),
      show: vi.fn(),
      focus: vi.fn()
    };

    showWindowFromTray(window, { x: 10, y: 20, width: 520, height: 640 });

    expect(window.setSkipTaskbar).toHaveBeenCalledWith(true);
    expect(window.setBounds).toHaveBeenCalledWith({ x: 10, y: 20, width: 520, height: 640 }, false);
    expect(window.show).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
  });

  it("hides the main window to the tray instead of minimizing it", () => {
    const window = {
      hide: vi.fn(),
      setSkipTaskbar: vi.fn()
    };

    hideWindowToTray(window);

    expect(window.hide).toHaveBeenCalled();
    expect(window.setSkipTaskbar).toHaveBeenCalledWith(true);
  });
});

import type { BrowserWindow, Rectangle } from "electron";

type ShowableTrayWindow = Pick<BrowserWindow, "focus" | "setBounds" | "setSkipTaskbar" | "show">;
type HideableTrayWindow = Pick<BrowserWindow, "hide" | "setSkipTaskbar">;

export function showWindowFromTray(window: ShowableTrayWindow, bounds: Rectangle): void {
  window.setSkipTaskbar(true);
  window.setBounds(bounds, false);
  window.show();
  window.setSkipTaskbar(true);
  window.focus();
}

export function hideWindowToTray(window: HideableTrayWindow | undefined): void {
  if (!window) {
    return;
  }

  window.hide();
  window.setSkipTaskbar(true);
}

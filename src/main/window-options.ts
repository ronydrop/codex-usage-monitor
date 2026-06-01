import type { BrowserWindowConstructorOptions } from "electron";
import type { WindowBounds } from "./window-position";

type CreateMainWindowOptionsInput = {
  bounds: WindowBounds;
  icon: BrowserWindowConstructorOptions["icon"];
  preloadPath: string;
};

export function createMainWindowOptions({
  bounds,
  icon,
  preloadPath
}: CreateMainWindowOptionsInput): BrowserWindowConstructorOptions {
  return {
    ...bounds,
    minWidth: 460,
    minHeight: 560,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    title: "Codex Usage Monitor",
    icon,
    backgroundColor: "#0d1210",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };
}

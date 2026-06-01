import { describe, expect, it } from "vitest";
import { createMainWindowOptions } from "../main/window-options";

describe("createMainWindowOptions", () => {
  it("creates a frameless window without a native menu bar", () => {
    const options = createMainWindowOptions({
      bounds: { x: 100, y: 200, width: 520, height: 640 },
      icon: "icon",
      preloadPath: "preload.mjs"
    });

    expect(options).toMatchObject({
      x: 100,
      y: 200,
      width: 520,
      height: 640,
      frame: false,
      autoHideMenuBar: true,
      title: "Codex Usage Monitor",
      backgroundColor: "#0d1210",
      webPreferences: {
        preload: "preload.mjs",
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
  });
});

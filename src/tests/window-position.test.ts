import { describe, expect, it } from "vitest";
import { getBottomRightWindowBounds } from "../main/window-position";

describe("getBottomRightWindowBounds", () => {
  it("places the window at the bottom-right of the work area with margin", () => {
    expect(
      getBottomRightWindowBounds(
        { x: 0, y: 0, width: 1920, height: 1080 },
        { width: 520, height: 640 },
        18
      )
    ).toEqual({ x: 1382, y: 422, width: 520, height: 640 });
  });

  it("supports monitors with negative coordinates", () => {
    expect(
      getBottomRightWindowBounds(
        { x: -1280, y: 80, width: 1280, height: 720 },
        { width: 520, height: 640 },
        12
      )
    ).toEqual({ x: -532, y: 148, width: 520, height: 640 });
  });
});

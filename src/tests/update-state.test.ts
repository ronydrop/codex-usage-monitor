import { describe, expect, it } from "vitest";
import { createInitialUpdateState, reduceUpdateState } from "../main/update-state";

describe("update state", () => {
  it("marks a higher remote version as available", () => {
    const state = reduceUpdateState(createInitialUpdateState("0.1.0"), {
      type: "available",
      latestVersion: "0.2.0"
    });

    expect(state.status).toBe("available");
    expect(state.currentVersion).toBe("0.1.0");
    expect(state.latestVersion).toBe("0.2.0");
  });

  it("does not mark the current version as an available update", () => {
    const state = reduceUpdateState(createInitialUpdateState("0.1.0"), {
      type: "not-available",
      latestVersion: "0.1.0"
    });

    expect(state.status).toBe("not-available");
    expect(state.currentVersion).toBe("0.1.0");
    expect(state.latestVersion).toBe("0.1.0");
  });

  it("keeps downloaded update metadata for install", () => {
    const state = reduceUpdateState(createInitialUpdateState("0.1.0"), {
      type: "downloaded",
      latestVersion: "0.2.0"
    });

    expect(state.status).toBe("downloaded");
    expect(state.latestVersion).toBe("0.2.0");
  });
});

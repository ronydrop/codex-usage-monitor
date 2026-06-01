import type { UpdateState } from "../shared/types";

export type UpdateStateEvent =
  | { type: "checking" }
  | { type: "available"; latestVersion?: string }
  | { type: "not-available"; latestVersion?: string }
  | { type: "downloading"; latestVersion?: string; progressPercent?: number }
  | { type: "downloaded"; latestVersion?: string }
  | { type: "disabled"; errorMessage: string }
  | { type: "error"; errorMessage: string };

export function createInitialUpdateState(currentVersion: string): UpdateState {
  return {
    status: "idle",
    currentVersion
  };
}

export function reduceUpdateState(
  state: UpdateState,
  event: UpdateStateEvent,
  now: () => Date = () => new Date()
): UpdateState {
  const checkedAt = now().toISOString();

  if (event.type === "checking") {
    return {
      currentVersion: state.currentVersion,
      latestVersion: state.latestVersion,
      status: "checking",
      checkedAt
    };
  }

  if (event.type === "available") {
    return {
      currentVersion: state.currentVersion,
      latestVersion: event.latestVersion,
      status: "available",
      checkedAt
    };
  }

  if (event.type === "not-available") {
    return {
      currentVersion: state.currentVersion,
      latestVersion: event.latestVersion ?? state.currentVersion,
      status: "not-available",
      checkedAt
    };
  }

  if (event.type === "downloading") {
    return {
      currentVersion: state.currentVersion,
      latestVersion: event.latestVersion ?? state.latestVersion,
      progressPercent: event.progressPercent,
      status: "downloading",
      checkedAt
    };
  }

  if (event.type === "downloaded") {
    return {
      currentVersion: state.currentVersion,
      latestVersion: event.latestVersion ?? state.latestVersion,
      status: "downloaded",
      checkedAt
    };
  }

  return {
    currentVersion: state.currentVersion,
    latestVersion: state.latestVersion,
    status: event.type,
    checkedAt,
    errorMessage: event.errorMessage
  };
}

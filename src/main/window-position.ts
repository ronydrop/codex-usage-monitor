export type WorkArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WindowSize = {
  width: number;
  height: number;
};

export type WindowBounds = WindowSize & {
  x: number;
  y: number;
};

export function getBottomRightWindowBounds(workArea: WorkArea, size: WindowSize, margin = 18): WindowBounds {
  return {
    x: Math.max(workArea.x, workArea.x + workArea.width - size.width - margin),
    y: Math.max(workArea.y, workArea.y + workArea.height - size.height - margin),
    width: size.width,
    height: size.height
  };
}


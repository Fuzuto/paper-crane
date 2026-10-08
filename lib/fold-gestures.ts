export interface FoldPoint { x: number; y: number }

export interface FoldGesture {
  start: FoldPoint;
  target: FoldPoint;
  crease: readonly [FoldPoint, FoldPoint];
  flap: readonly FoldPoint[];
  prompt: string;
}

/** Paper coordinates stay independent of the canvas size and pointer device. */
export const FOLD_GESTURES: readonly FoldGesture[] = [
  {
    start: { x: 310, y: 90 }, target: { x: 90, y: 310 },
    crease: [{ x: 90, y: 90 }, { x: 310, y: 310 }],
    flap: [{ x: 310, y: 90 }, { x: 90, y: 90 }, { x: 310, y: 310 }],
    prompt: "Bring the upper right corner to the lower left corner.",
  },
  {
    start: { x: 90, y: 310 }, target: { x: 310, y: 90 },
    crease: [{ x: 90, y: 90 }, { x: 310, y: 310 }],
    flap: [{ x: 90, y: 310 }, { x: 90, y: 90 }, { x: 310, y: 310 }],
    prompt: "Lift the lower left corner back across the diagonal.",
  },
  {
    start: { x: 200, y: 310 }, target: { x: 200, y: 90 },
    crease: [{ x: 90, y: 200 }, { x: 310, y: 200 }],
    flap: [{ x: 200, y: 310 }, { x: 90, y: 310 }, { x: 90, y: 200 }, { x: 310, y: 200 }, { x: 310, y: 310 }],
    prompt: "Bring the bottom edge up to meet the top edge.",
  },
  {
    start: { x: 310, y: 145 }, target: { x: 200, y: 255 },
    crease: [{ x: 200, y: 145 }, { x: 310, y: 255 }],
    flap: [{ x: 310, y: 145 }, { x: 200, y: 145 }, { x: 310, y: 255 }],
    prompt: "Guide the right corner inward to gather the square base.",
  },
  {
    start: { x: 75, y: 200 }, target: { x: 200, y: 200 },
    crease: [{ x: 137.5, y: 135 }, { x: 137.5, y: 265 }],
    flap: [{ x: 75, y: 200 }, { x: 137.5, y: 135 }, { x: 137.5, y: 265 }],
    prompt: "Fold the left point inward to the center line.",
  },
  {
    start: { x: 270, y: 210 }, target: { x: 200, y: 210 },
    crease: [{ x: 235, y: 140 }, { x: 235, y: 270 }],
    flap: [{ x: 270, y: 210 }, { x: 235, y: 140 }, { x: 235, y: 270 }],
    prompt: "Bring the right point in to meet the center line.",
  },
  {
    start: { x: 200, y: 355 }, target: { x: 200, y: 45 },
    crease: [{ x: 130, y: 200 }, { x: 270, y: 200 }],
    flap: [{ x: 200, y: 355 }, { x: 130, y: 200 }, { x: 270, y: 200 }],
    prompt: "Lift the bottom point upward to open the first petal.",
  },
  {
    start: { x: 200, y: 355 }, target: { x: 200, y: 45 },
    crease: [{ x: 150, y: 200 }, { x: 250, y: 200 }],
    flap: [{ x: 200, y: 355 }, { x: 150, y: 200 }, { x: 250, y: 200 }],
    prompt: "Lift this bottom point upward to open the second petal.",
  },
  {
    start: { x: 175, y: 355 }, target: { x: 200, y: 275 },
    crease: [{ x: 169.288618, y: 309.308943 }, { x: 186.826599, y: 314.789562 }],
    flap: [{ x: 175, y: 355 }, { x: 169.288618, y: 309.308943 }, { x: 186.826599, y: 314.789562 }],
    prompt: "Bring the lower left point inward to make a slender fold.",
  },
  {
    start: { x: 335, y: 85 }, target: { x: 280, y: 175 },
    crease: [{ x: 303.214286, y: 127.380952 }, { x: 249.423077, y: 94.508547 }],
    flap: [{ x: 335, y: 85 }, { x: 303.214286, y: 127.380952 }, { x: 249.423077, y: 94.508547 }],
    prompt: "Guide the right point inward to shape the raised tail.",
  },
  {
    start: { x: 110, y: 75 }, target: { x: 135, y: 125 },
    crease: [{ x: 128.382353, y: 97.058824 }, { x: 95.576923, y: 113.461538 }],
    flap: [{ x: 110, y: 75 }, { x: 128.382353, y: 97.058824 }, { x: 95.576923, y: 113.461538 }],
    prompt: "Bend the upper left tip down to give your crane a head.",
  },
  {
    start: { x: 335, y: 85 }, target: { x: 355, y: 150 },
    crease: [{ x: 309.707031, y: 128.359375 }, { x: 280.706522, y: 137.282609 }],
    flap: [{ x: 335, y: 85 }, { x: 309.707031, y: 128.359375 }, { x: 280.706522, y: 137.282609 }],
    prompt: "Draw the right wing downward and let your crane open.",
  },
];

/** A fold follows movement along its guide and only finishes close to its mark. */
export function sampleFoldGesture(gesture: FoldGesture, point: FoldPoint): { progress: number; canCommit: boolean } {
  const dx = gesture.target.x - gesture.start.x;
  const dy = gesture.target.y - gesture.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(lengthSquared) || lengthSquared === 0) {
    return { progress: 0, canCommit: false };
  }
  const projected = ((point.x - gesture.start.x) * dx + (point.y - gesture.start.y) * dy) / lengthSquared;
  if (!Number.isFinite(projected)) return { progress: 0, canCommit: false };
  return {
    progress: Math.max(0, Math.min(1, projected)),
    canCommit: projected >= 0.9 && Math.hypot(point.x - gesture.target.x, point.y - gesture.target.y) <= 24,
  };
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { FOLD_GESTURES, sampleFoldGesture } from "../lib/fold-gestures";
import { FOLD_STEPS } from "../lib/folding";

test("every stage has a visible paper gesture with a matching fold hinge", () => {
  assert.equal(FOLD_GESTURES.length, FOLD_STEPS.length);
  for (const gesture of FOLD_GESTURES) {
    const dx = gesture.target.x - gesture.start.x;
    const dy = gesture.target.y - gesture.start.y;
    assert.ok(Math.hypot(dx, dy) > 48);
    assert.ok(gesture.prompt.length > 10);
    assert.ok(gesture.flap.some((point) => point.x === gesture.start.x && point.y === gesture.start.y));
    for (const point of [gesture.start, gesture.target, ...gesture.crease, ...gesture.flap]) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= 0 && point.x <= 400 && point.y >= 0 && point.y <= 400);
    }
    for (const point of gesture.crease) {
      const midpoint = { x: (gesture.start.x + gesture.target.x) / 2, y: (gesture.start.y + gesture.target.y) / 2 };
      assert.ok(Math.abs((point.x - midpoint.x) * dx + (point.y - midpoint.y) * dy) < 0.01);
      assert.ok(gesture.flap.some((vertex) => vertex.x === point.x && vertex.y === point.y));
    }
  }
});

test("fold progress requires movement and arriving at the target", () => {
  for (const gesture of FOLD_GESTURES) {
    assert.deepEqual(sampleFoldGesture(gesture, gesture.start), { progress: 0, canCommit: false });
    assert.deepEqual(sampleFoldGesture(gesture, gesture.target), { progress: 1, canCommit: true });
    const halfway = { x: (gesture.start.x + gesture.target.x) / 2, y: (gesture.start.y + gesture.target.y) / 2 };
    assert.deepEqual(sampleFoldGesture(gesture, halfway), { progress: 0.5, canCommit: false });
    // Holding still can never advance a fold, regardless of the number of samples.
    for (let frame = 0; frame < 120; frame++) assert.equal(sampleFoldGesture(gesture, gesture.start).progress, 0);
  }
});

test("wrong direction, sideways movement, and distant overshoots cannot finish", () => {
  for (const gesture of FOLD_GESTURES) {
    const dx = gesture.target.x - gesture.start.x;
    const dy = gesture.target.y - gesture.start.y;
    const length = Math.hypot(dx, dy);
    assert.deepEqual(sampleFoldGesture(gesture, { x: gesture.start.x - dx, y: gesture.start.y - dy }), { progress: 0, canCommit: false });
    assert.equal(sampleFoldGesture(gesture, { x: gesture.target.x - dy / length * 80, y: gesture.target.y + dx / length * 80 }).canCommit, false);
    assert.deepEqual(sampleFoldGesture(gesture, { x: gesture.target.x + dx / length * 40, y: gesture.target.y + dy / length * 40 }), { progress: 1, canCommit: false });
    assert.equal(sampleFoldGesture(gesture, { x: gesture.target.x + dx / length * 8, y: gesture.target.y + dy / length * 8 }).canCommit, true);
  }
});

test("non-finite coordinates and invalid geometry cannot advance a fold", () => {
  const gesture = FOLD_GESTURES[0];
  for (const point of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: -Infinity, y: 0 }]) {
    assert.deepEqual(sampleFoldGesture(gesture, point), { progress: 0, canCommit: false });
  }
  assert.deepEqual(sampleFoldGesture({ ...gesture, target: gesture.start }, gesture.target), { progress: 0, canCommit: false });
  assert.deepEqual(sampleFoldGesture({ ...gesture, start: { x: NaN, y: 0 } }, gesture.target), { progress: 0, canCommit: false });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CRANE_STORAGE_KEY, CraneStorageError, deleteCrane, loadCranes, saveCrane,
  type Crane, type CraneStorage,
} from "../lib/cranes";
import { createFoldingState, FOLD_STEPS, foldingReducer } from "../lib/folding";

function memoryStorage(initial?: string): CraneStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key) { assert.equal(key, CRANE_STORAGE_KEY); return this.value; },
    setItem(key, value) { assert.equal(key, CRANE_STORAGE_KEY); this.value = value; },
  };
}

const crane: Crane = {
  id: "first-crane", name: "A small beginning", wish: "May we find a little peace.",
  color: "rose", pattern: "plain", visibility: "private", createdAt: "2026-10-07T12:00:00.000Z", folds: 12,
};

test("a completed crane survives reload and retry does not duplicate the collection", () => {
  const storage = memoryStorage();
  assert.deepEqual(loadCranes(storage), []);
  saveCrane(crane, storage);
  saveCrane({ ...crane, wish: "An edited wish." }, storage);
  assert.equal(loadCranes(storage).length, 1);
  assert.equal(loadCranes(storage)[0].wish, "An edited wish.");
  assert.equal(loadCranes(storage)[0].visibility, "private");
});

test("collection ordering and deletion stay correct across a reload", () => {
  const storage = memoryStorage();
  saveCrane(crane, storage);
  saveCrane({ ...crane, id: "second-crane", color: "sage", createdAt: "2026-10-08T12:00:00.000Z" }, storage);
  assert.deepEqual(loadCranes(storage).map((item) => item.id), ["second-crane", "first-crane"]);
  deleteCrane("second-crane", storage);
  assert.deepEqual(loadCranes(storage), [crane]);
});

test("malformed or unsupported data is preserved when a save is attempted", () => {
  for (const original of ["not-json", JSON.stringify({ version: 2, cranes: [] }), JSON.stringify({ version: 1, cranes: [{ ...crane, folds: 1 }] })]) {
    const storage = memoryStorage(original);
    assert.throws(() => saveCrane(crane, storage), CraneStorageError);
    assert.equal(storage.value, original);
  }
});

test("incomplete creation data cannot overwrite a healthy collection", () => {
  const storage = memoryStorage();
  saveCrane(crane, storage);
  const original = storage.value;
  assert.throws(() => saveCrane({ ...crane, name: "   " }, storage), (error) => error instanceof CraneStorageError && error.code === "invalid-data");
  assert.equal(storage.value, original);
});

test("blocked reads and full storage provide recoverable errors instead of false success", () => {
  const blocked: CraneStorage = { getItem() { throw new Error("Blocked"); }, setItem() {} };
  assert.throws(() => loadCranes(blocked), (error) => error instanceof CraneStorageError && error.code === "unavailable");
  const full: CraneStorage = { getItem() { return null; }, setItem() { throw Object.assign(new Error("Full"), { name: "QuotaExceededError" }); } };
  assert.throws(() => saveCrane(crane, full), (error) => error instanceof CraneStorageError && error.code === "full");
});

test("a fold needs deliberate progress, and the wish opens only after every stage", () => {
  let state = foldingReducer(createFoldingState(), { type: "start" });
  assert.equal(foldingReducer(state, { type: "commit-fold" }).completedSteps, 0);
  state = foldingReducer(state, { type: "preview", progress: Number.NaN });
  assert.equal(state.previewProgress, 0);
  for (let index = 0; index < FOLD_STEPS.length; index++) {
    state = foldingReducer(state, { type: "preview", progress: 1 });
    state = foldingReducer(state, { type: "commit-fold" });
    assert.equal(state.phase, index === FOLD_STEPS.length - 1 ? "wish" : "folding");
  }
  state = foldingReducer(state, { type: "undo" });
  assert.equal(state.phase, "folding");
  assert.equal(state.completedSteps, 11);
  state = foldingReducer(state, { type: "restart" });
  assert.equal(state.phase, "paper");
  assert.equal(state.completedSteps, 0);
});

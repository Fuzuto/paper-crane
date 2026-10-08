import type { PaperColor, PaperPattern } from "./cranes";

export interface FoldStep {
  id: string;
  title: string;
  instruction: string;
  hint: string;
}

/** Guided groups of traditional crane folds. Each stage waits for a deliberate crease. */
export const FOLD_STEPS: readonly FoldStep[] = [
  { id: "first-diagonal", title: "A first crease", instruction: "Bring one corner to its opposite. Press a diagonal crease, then open your paper.", hint: "Every journey begins with a small fold." },
  { id: "second-diagonal", title: "Find the other diagonal", instruction: "Bring the remaining two corners together. Crease and open to make a gentle X.", hint: "Let the corners meet before you press." },
  { id: "cross-creases", title: "Meet in the middle", instruction: "Turn the paper over. Fold edge to edge, open, and repeat in the other direction.", hint: "These creases will guide the paper inward." },
  { id: "square-base", title: "Gather the corners", instruction: "Bring the side corners inward along your creases. Flatten the paper into a small square.", hint: "The open points should face toward you." },
  { id: "left-kite", title: "Fold toward the center", instruction: "Fold the left edge of the top layer inward until it meets the center line.", hint: "A light touch makes a clear crease." },
  { id: "right-kite", title: "Find a little symmetry", instruction: "Fold the right edge of the top layer to the center. Fold the top triangle down, then unfold these creases.", hint: "The paper remembers each crease." },
  { id: "first-petal", title: "Open a petal", instruction: "Lift the bottom corner of the top layer. Guide its sides inward and flatten into a long diamond.", hint: "Move slowly as the paper opens." },
  { id: "second-petal", title: "Turn and repeat", instruction: "Turn your paper over. Repeat the center creases and petal fold on this side.", hint: "Two matching petals become the bird base." },
  { id: "narrow-points", title: "Give your crane its shape", instruction: "Fold the lower edges of both sides toward the center to make two slender points.", hint: "These points will become the neck and tail." },
  { id: "neck-tail", title: "Raise the neck and tail", instruction: "Fold each slender point upward. Tuck the creases inside with an inside reverse fold.", hint: "Your crane is beginning to take flight." },
  { id: "head", title: "A small bow", instruction: "Fold the tip of one raised point downward. Reverse the fold inward to form the head.", hint: "A small fold gives your crane its character." },
  { id: "wings", title: "Let your wings open", instruction: "Fold the wide flaps down into wings. Gently draw them apart and shape the body.", hint: "Twelve moments of care. One crane, made by you." },
];

export const FOLD_COMMIT_THRESHOLD = 0.96;
export type FoldingPhase = "paper" | "folding" | "wish" | "complete";

export interface FoldingState {
  phase: FoldingPhase;
  color: PaperColor;
  pattern: PaperPattern;
  completedSteps: number;
  previewProgress: number;
}

export type FoldingAction =
  | { type: "choose-paper"; color: PaperColor; pattern: PaperPattern }
  | { type: "start" }
  | { type: "preview"; progress: number }
  | { type: "commit-fold" }
  | { type: "undo" }
  | { type: "restart" }
  | { type: "finish" };

export function createFoldingState(color: PaperColor = "rose", pattern: PaperPattern = "plain"): FoldingState {
  return { phase: "paper", color, pattern, completedSteps: 0, previewProgress: 0 };
}

export function canCommitFold(state: FoldingState): boolean {
  return state.phase === "folding" && state.completedSteps < FOLD_STEPS.length && state.previewProgress >= FOLD_COMMIT_THRESHOLD;
}

/** Pointer dragging and keyboard controls both send progress, then commit the same fold. */
export function foldingReducer(state: FoldingState, action: FoldingAction): FoldingState {
  switch (action.type) {
    case "choose-paper":
      return state.phase === "paper" ? { ...state, color: action.color, pattern: action.pattern } : state;
    case "start":
      return state.phase === "paper" ? { ...state, phase: "folding" } : state;
    case "preview":
      return state.phase === "folding" && Number.isFinite(action.progress)
        ? { ...state, previewProgress: Math.max(0, Math.min(1, action.progress)) }
        : state;
    case "commit-fold": {
      if (!canCommitFold(state)) return state;
      const completedSteps = state.completedSteps + 1;
      return { ...state, completedSteps, previewProgress: 0, phase: completedSteps === FOLD_STEPS.length ? "wish" : "folding" };
    }
    case "undo":
      return (state.phase === "folding" || state.phase === "wish") && state.completedSteps > 0
        ? { ...state, phase: "folding", completedSteps: state.completedSteps - 1, previewProgress: 0 }
        : state;
    case "restart":
      return createFoldingState(state.color, state.pattern);
    case "finish":
      return state.phase === "wish" ? { ...state, phase: "complete" } : state;
  }
}

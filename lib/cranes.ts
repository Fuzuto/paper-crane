export const CRANE_STORAGE_KEY = "paper-crane.collection.v1";
export const CRANE_FOLD_COUNT = 12;
export const MAX_CRANE_NAME_LENGTH = 60;
export const MAX_WISH_LENGTH = 280;

export type PaperColor = "rose" | "sage" | "sky" | "lilac" | "ivory" | "ochre";
export type PaperPattern = "plain" | "seigaiha" | "speckled";
export type CraneVisibility = "private" | "public";

export const PAPER_COLORS: readonly { id: PaperColor; name: string; hex: string }[] = [
  { id: "rose", name: "Sakura", hex: "#D99592" },
  { id: "sage", name: "Matcha", hex: "#A5B396" },
  { id: "sky", name: "Morning sky", hex: "#A0BAC7" },
  { id: "lilac", name: "Wisteria", hex: "#B5A3C2" },
  { id: "ivory", name: "Rice paper", hex: "#E5DDC9" },
  { id: "ochre", name: "Marigold", hex: "#DAB878" },
];

export const PAPER_PATTERNS: readonly { id: PaperPattern; name: string }[] = [
  { id: "plain", name: "Plain washi" },
  { id: "seigaiha", name: "Ocean waves" },
  { id: "speckled", name: "Paper flecks" },
];

/** Prototype creation data only. Authentication and session data never belong here. */
export interface Crane {
  id: string;
  name: string;
  wish: string;
  color: PaperColor;
  pattern: PaperPattern;
  visibility: CraneVisibility;
  createdAt: string;
  folds: typeof CRANE_FOLD_COUNT;
}

export interface CraneStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type CraneStorageErrorCode =
  | "unavailable"
  | "full"
  | "invalid-data"
  | "corrupt-data"
  | "unsupported-version";

export class CraneStorageError extends Error {
  constructor(public readonly code: CraneStorageErrorCode, message: string) {
    super(message);
    this.name = "CraneStorageError";
  }
}

function browserStorage(): CraneStorage {
  try {
    if (typeof window === "undefined") {
      throw new Error("Browser storage is unavailable outside the browser.");
    }
    return window.localStorage;
  } catch {
    throw new CraneStorageError(
      "unavailable",
      "Your browser cannot save this collection. Check its storage settings and try again.",
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCrane(value: unknown): value is Crane {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value.id) &&
    typeof value.name === "string" && value.name.trim().length > 0 &&
    value.name.length <= MAX_CRANE_NAME_LENGTH &&
    typeof value.wish === "string" && value.wish.length <= MAX_WISH_LENGTH &&
    PAPER_COLORS.some((paper) => paper.id === value.color) &&
    PAPER_PATTERNS.some((paper) => paper.id === value.pattern) &&
    (value.visibility === "private" || value.visibility === "public") &&
    typeof value.createdAt === "string" && value.createdAt.length <= 64 &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    value.folds === CRANE_FOLD_COUNT
  );
}

function normalizeCrane(crane: Crane): Crane {
  return {
    id: crane.id,
    name: crane.name.trim(),
    wish: crane.wish.trim(),
    color: crane.color,
    pattern: crane.pattern,
    visibility: crane.visibility,
    createdAt: crane.createdAt,
    folds: CRANE_FOLD_COUNT,
  };
}

function newestFirst(cranes: Crane[]): Crane[] {
  return cranes.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Read errors preserve the stored value; malformed collections are never overwritten silently. */
export function loadCranes(storage?: CraneStorage): Crane[] {
  if (!storage && typeof window === "undefined") return [];
  const source = storage ?? browserStorage();
  let raw: string | null;
  try {
    raw = source.getItem(CRANE_STORAGE_KEY);
  } catch {
    throw new CraneStorageError("unavailable", "Your browser could not open this collection. Please try again.");
  }
  if (raw === null) return [];
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    throw new CraneStorageError("corrupt-data", "This saved collection could not be read. Its original data has been preserved.");
  }
  if (!isRecord(saved)) {
    throw new CraneStorageError("corrupt-data", "This saved collection has an unexpected format. Its original data has been preserved.");
  }
  if (saved.version !== 1) {
    throw new CraneStorageError("unsupported-version", "This collection uses an unsupported format. Its original data has been preserved.");
  }
  if (!Array.isArray(saved.cranes) || !saved.cranes.every(isCrane)) {
    throw new CraneStorageError("corrupt-data", "Some saved cranes could not be read. Your original collection has been preserved.");
  }
  const ids = new Set<string>();
  for (const crane of saved.cranes) {
    if (ids.has(crane.id)) {
      throw new CraneStorageError("corrupt-data", "This collection contains duplicate entries. Its original data has been preserved.");
    }
    ids.add(crane.id);
  }
  return newestFirst(saved.cranes.map(normalizeCrane));
}

function writeCollection(cranes: Crane[], storage: CraneStorage): Crane[] {
  try {
    storage.setItem(CRANE_STORAGE_KEY, JSON.stringify({ version: 1, cranes }));
  } catch (error) {
    const name = isRecord(error) ? error.name : undefined;
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
      throw new CraneStorageError("full", "Your browser's storage is full. Remove a saved crane or free some storage, then try again.");
    }
    throw new CraneStorageError("unavailable", "Your browser could not save this crane. Please try again before leaving.");
  }
  return cranes;
}

/** A stable ID makes retries and edits replace an existing crane instead of counting it twice. */
export function saveCrane(crane: Crane, storage?: CraneStorage): Crane[] {
  if (!isCrane(crane)) {
    throw new CraneStorageError("invalid-data", "This crane is incomplete. Check its name and wish before saving.");
  }
  const target = storage ?? browserStorage();
  const current = loadCranes(target);
  const next = newestFirst([normalizeCrane(crane), ...current.filter((item) => item.id !== crane.id)]);
  return writeCollection(next, target);
}

export function deleteCrane(id: string, storage?: CraneStorage): Crane[] {
  const target = storage ?? browserStorage();
  const current = loadCranes(target);
  const next = current.filter((crane) => crane.id !== id);
  return next.length === current.length ? current : writeCollection(next, target);
}

/** A future server adapter can implement this contract without changing creation data. */
export interface CraneRepository {
  list(): Promise<Crane[]>;
  save(crane: Crane): Promise<Crane[]>;
  remove(id: string): Promise<Crane[]>;
}

export const localCraneRepository: CraneRepository = {
  list: async () => loadCranes(),
  save: async (crane) => saveCrane(crane),
  remove: async (id) => deleteCrane(id),
};


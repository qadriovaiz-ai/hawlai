// Which columns the Campaign Performance History table shows.
//
// Preferences live in localStorage (a per-person display setting, not
// business data). The first version saved a bare array of visible keys.
// Read naively, that array HIDES every column added later: anyone who
// ever customised the table would never see Status or Campaign ID,
// because their saved list predates them. So the saved value now also
// records which columns existed when it was saved; a column the person
// has never been offered gets its default.

export const ALL_COLUMN_KEYS = ["status", "campaignId", "days", "spend", "leads", "costPerLead", "conversions", "revenue", "roas"] as const;
export type ColumnKey = (typeof ALL_COLUMN_KEYS)[number];

export const DEFAULT_VISIBLE: ColumnKey[] = [...ALL_COLUMN_KEYS];

/** The columns that existed when preferences were saved as a bare array. */
const LEGACY_KEYS: readonly string[] = ["days", "spend", "leads", "costPerLead", "conversions", "revenue", "roas"];

export type SavedColumns = { visible: string[]; known: string[] };

const isKey = (k: unknown): k is ColumnKey => typeof k === "string" && (ALL_COLUMN_KEYS as readonly string[]).includes(k);

export function resolveVisibleColumns(saved: unknown): ColumnKey[] {
  let visible: unknown[];
  let known: readonly string[];
  if (Array.isArray(saved)) {
    visible = saved;
    known = LEGACY_KEYS;
  } else if (saved && typeof saved === "object" && Array.isArray((saved as SavedColumns).visible)) {
    visible = (saved as SavedColumns).visible;
    known = Array.isArray((saved as SavedColumns).known) ? (saved as SavedColumns).known : LEGACY_KEYS;
  } else {
    return [...DEFAULT_VISIBLE];
  }
  const shown = new Set(visible.filter(isKey));
  const next = ALL_COLUMN_KEYS.filter((k) => (known.includes(k) ? shown.has(k) : DEFAULT_VISIBLE.includes(k)));
  return next.length > 0 ? next : [...DEFAULT_VISIBLE];
}

export function serializeColumns(visible: ColumnKey[]): SavedColumns {
  return { visible: [...visible], known: [...ALL_COLUMN_KEYS] };
}

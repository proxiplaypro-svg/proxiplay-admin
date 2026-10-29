export type TimestampLike =
  | Date
  | number
  | { toMillis(): number }
  | { seconds?: number; _seconds?: number; nanoseconds?: number; _nanoseconds?: number };

export type GameAccessState = "playable" | "not_playable" | "indeterminate";

export const DAY_MS: number;
export const ROLLING_30_DAYS_MS: number;
export function toMillis(value: unknown): number | null;
export function isEligibleRegisteredPlayer(user: {
  user_role?: unknown;
  is_test_account?: unknown;
  is_deleted?: unknown;
  [field: string]: unknown;
} | null | undefined): boolean;
export function isParticipationInRolling30Days(participationOrDate: unknown, now?: TimestampLike): boolean;
export function parisDayKey(value: unknown): string | null;
export function merchantIdentity(game: Record<string, unknown> | null | undefined): string | null;
export function gamePublicationState(game: Record<string, unknown> | null | undefined):
  "disabled" | "hidden" | "published" | "published_inconsistent" | "draft";
export function gameInProgress(game: Record<string, unknown> | null | undefined, options?: {
  now?: TimestampLike;
  qrAccessState?: "ready" | "missing" | "regeneration-required" | "ended";
}): { state: GameAccessState; reason: string };

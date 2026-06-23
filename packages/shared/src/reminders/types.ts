/** A single concrete future notification the client should arm. */
export interface Occurrence {
  /** Deterministic id (userId + epoch-minute + content hash) so re-arm is idempotent. */
  id: string
  /** ISO 8601 UTC instant the notification fires. */
  fireAtUtc: string
  /** ISO 8601 with the device zone offset (for display / debugging). */
  fireAtLocal: string
  title: string
  body: string
  payload: { url: string; tag: string }
}

export interface ComputeOptions {
  /** Owner id — part of the deterministic occurrence id. */
  userId: string
  /** Device's current IANA zone (Intl.DateTimeFormat().resolvedOptions().timeZone). */
  zone: string
  /** Platform permission status — passed in; the pure function never queries the OS. */
  permissionGranted: boolean
  /** "Now" as an instant. */
  now: Date
  /** Per-platform pending cap to fill (iOS <= ~60). */
  maxOccurrences: number
  /** Keep only occurrences strictly later than now + this. Default 30s. */
  leadBufferSec?: number
  /** Hard look-ahead cap in days. Default 365. */
  horizonDays?: number
  /** Notification copy (content hash forces reschedule when it changes). */
  copy?: { title: string; body: string }
}

export interface PendingNotification {
  id: string
}

/**
 * The injected platform port. expo-notifications, the Tauri tokio loop, and the
 * web in-tab timer each implement this; the shared `rearm` drives it identically.
 */
export interface NotificationScheduler {
  getPending(): Promise<PendingNotification[]>
  schedule(occurrence: Occurrence): Promise<void>
  cancel(ids: string[]): Promise<void>
  cancelAll(): Promise<void>
}

export interface ScheduleDiff {
  toSchedule: Occurrence[]
  toCancel: string[]
}

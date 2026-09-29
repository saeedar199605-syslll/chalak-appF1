export const CLOUD_SYNC_POLL_INTERVAL_MS = 30_000;
export const CLOUD_SYNC_MAX_RETRIES = 8;

export function getCloudRetryDelay(attempt: number): number {
  const bounded = Math.max(0, Math.min(CLOUD_SYNC_MAX_RETRIES - 1, Math.floor(attempt)));
  return Math.min(30_000, 1_000 * (2 ** bounded));
}

export function shouldRetryCloudStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function isTerminalCloudWriteStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 413 || status === 415;
}

/** Compact fingerprint for suppressing repeat writes without retaining another full state copy. */
export function cloudWriteFingerprint(baseRevision: number, rawEntries: Iterable<[string, string | null]>): string {
  const entries = Array.from(rawEntries).sort(([left], [right]) => left.localeCompare(right));
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  let length = 0;
  for (const [key, raw] of entries) {
    const part = `${key}\u0000${raw ?? '<null>'}\u0001`;
    length += part.length;
    for (let index = 0; index < part.length; index += 1) {
      const code = part.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ (code + index), 0x85ebca6b);
    }
  }
  return `${baseRevision}:${entries.length}:${length}:${first >>> 0}:${second >>> 0}`;
}

export function isSameRejectedSnapshot(rejectedFingerprint: string | null, currentFingerprint: string): boolean {
  return Boolean(rejectedFingerprint && rejectedFingerprint === currentFingerprint);
}

export function shouldScheduleCloudSyncFollowup(args: {
  enabled: boolean;
  hasConflict: boolean;
  dirtyKeyCount: number;
  attemptedFingerprint: string;
  currentFingerprint: string;
  rejectedFingerprint: string | null;
}): boolean {
  return args.enabled && !args.hasConflict && args.dirtyKeyCount > 0 &&
    args.currentFingerprint !== args.attemptedFingerprint &&
    !isSameRejectedSnapshot(args.rejectedFingerprint, args.currentFingerprint);
}

export function selectCloudSyncOperation(hasRevisionConflict: boolean, dirtyKeyCount: number): 'pull' | 'push' {
  if (hasRevisionConflict) return 'pull';
  return dirtyKeyCount > 0 ? 'push' : 'pull';
}

export function shouldAttemptSync(retryExhausted: boolean, trigger: 'poll' | 'visible' | 'online' | 'manual'): boolean {
  return !retryExhausted || trigger === 'visible' || trigger === 'online' || trigger === 'manual';
}

/** Prevent a late response from an earlier signed-in session applying to the current cache. */
export function isCurrentSyncGeneration(requestGeneration: number, activeGeneration: number): boolean {
  return requestGeneration === activeGeneration;
}

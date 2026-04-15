import type { MatrixScopeResponse, MatrixScopeSummaryItem } from "./matrix-contract.js";

export type MatrixResolvedRoom = MatrixScopeResponse["scope"]["rooms"][number] & {
  members: number;
  lastEventSummary: string;
};

export type MatrixScopeSnapshot = {
  scopeId: string;
  snapshotId: string;
  type: MatrixScopeResponse["scope"]["type"];
  createdAt: string;
  createdAtMs: number;
  expiresAtMs: number;
  rooms: MatrixResolvedRoom[];
};

export type MatrixScopeStore = {
  ttlMs: number;
  put(snapshot: MatrixScopeSnapshot): void;
  get(scopeId: string): MatrixScopeSnapshot | null;
};

export function createMatrixScopeStore(ttlMs = 15 * 60 * 1000, now: () => number = () => Date.now()): MatrixScopeStore {
  const snapshots = new Map<string, MatrixScopeSnapshot>();

  return {
    ttlMs,
    put(snapshot) {
      snapshots.set(snapshot.scopeId, snapshot);
    },

    get(scopeId) {
      const snapshot = snapshots.get(scopeId);

      if (!snapshot) {
        return null;
      }

      if (snapshot.expiresAtMs <= now()) {
        snapshots.delete(scopeId);
        return null;
      }

      return snapshot;
    }
  };
}

export function buildMatrixScopeSummaryItems(snapshot: MatrixScopeSnapshot): MatrixScopeSummaryItem[] {
  const freshnessMs = Math.max(0, Date.now() - snapshot.createdAtMs);

  return snapshot.rooms.map((room) => ({
    roomId: room.roomId,
    name: room.name,
    canonicalAlias: room.canonicalAlias,
    members: room.members,
    freshnessMs,
    lastEventSummary: room.lastEventSummary,
    selected: true
  }));
}

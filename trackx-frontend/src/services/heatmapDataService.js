// Progressive fetch + cache for the main heatmap
// Fetches /cases/all-points-paginated in pages and caches combined results for 5 minutes.

import axiosInstance from "../api/axios";

const CACHE_KEY = 'heatmapPointsCache-v1';
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

let inMemory = {
  points: null,
  expiresAt: 0,
  pending: null,
};

function readStorage() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function writeStorage(payload) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch {}
}

export async function fetchHeatmapPointsProgressive({ pageSize = 200, onChunk, signal } = {}) {
  const now = Date.now();

  // Serve cached immediately if valid
  const cached = inMemory.points && inMemory.expiresAt > now
    ? { points: inMemory.points, expiresAt: inMemory.expiresAt }
    : readStorage();
  if (cached && cached.points && cached.expiresAt > now) {
    onChunk?.(cached.points.slice(), { done: true, fromCache: true });
    return cached.points.slice();
  }

  // Avoid duplicate concurrent runs
  if (inMemory.pending) return inMemory.pending;

  let all = [];
  let cursor = '';
  let cancelled = false;
  if (signal) {
    signal.addEventListener('abort', () => { cancelled = true; });
  }

  const run = (async () => {
    try {
      for (;;) {
        if (cancelled) break;
        const res = await axiosInstance.get("/cases/all-points-paginated", {
          params: { limit: pageSize, cursor },
        });
        const { points = [], nextCursor } = res.data || {};
        if (points.length) {
          all = all.concat(points);
          onChunk?.(points, { done: !nextCursor, total: all.length });
        }
        if (!nextCursor || cancelled) break;
        cursor = nextCursor;
      }
      const expiresAt = Date.now() + DEFAULT_TTL;
      inMemory.points = all;
      inMemory.expiresAt = expiresAt;
      writeStorage({ points: all, expiresAt });
      return all;
    } catch (e) {
      // Fallback: try legacy one-shot endpoint if pagination fails at the start
      if (!all.length) {
        try {
          const res = await axiosInstance.get("/cases/all-points-with-case-ids");
          const pts = (res.data?.points || []).map(p => ({
            lat: p.lat,
            lng: p.lng,
            timestamp: p.timestamp,
            caseId: p.caseId,
          }));
          const expiresAt = Date.now() + DEFAULT_TTL;
          inMemory.points = pts;
          inMemory.expiresAt = expiresAt;
          writeStorage({ points: pts, expiresAt });
          onChunk?.(pts, { done: true, total: pts.length, fallback: true });
          return pts;
        } catch (inner) {
          throw e;
        }
      } else {
        throw e;
      }
    } finally {
      inMemory.pending = null;
    }
  })();

  inMemory.pending = run;
  return run;
}

export function clearHeatmapCache() {
  inMemory = { points: null, expiresAt: 0, pending: null };
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

// Lightweight cache for mini heatmap points across pages
// Caches in-memory and mirrors state to localStorage with a short TTL.

import axiosInstance from "../api/axios";

const CACHE_KEY = 'miniHeatmapPointsCache-v1';
// default TTL in ms
// Default TTL is 5 minutes to reduce refetching across navigation
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
  } catch {
    return null;
  }
}

function writeStorage(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export async function getMiniHeatmapPoints({ limit = 10, ttlMs = DEFAULT_TTL } = {}) {
  const now = Date.now();

  // Serve from in-memory cache if valid
  if (inMemory.points && inMemory.expiresAt > now) {
    return inMemory.points;
  }

  // Serve from localStorage if valid
  const stored = readStorage();
  if (stored && stored.points && stored.expiresAt > now) {
    inMemory.points = stored.points;
    inMemory.expiresAt = stored.expiresAt;
    return stored.points;
  }

  // Coalesce concurrent fetches
  if (inMemory.pending) {
    return inMemory.pending;
  }

  inMemory.pending = axiosInstance
    .get("/cases/recent-points", { params: { limit } })
    .then((res) => {
      const points = res?.data?.points || [];
      const expiresAt = Date.now() + ttlMs;
      inMemory.points = points;
      inMemory.expiresAt = expiresAt;
      writeStorage({ points, expiresAt });
      return points;
    })
    .catch((e) => {
      // Do not poison the cache; just bubble error and clear pending
      throw e;
    })
    .finally(() => {
      inMemory.pending = null;
    });

  return inMemory.pending;
}

export function clearMiniHeatmapCache() {
  inMemory = { points: null, expiresAt: 0, pending: null };
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

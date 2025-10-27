// Cache and background-friendly fetcher for globe points
// Uses in-memory + localStorage cache to avoid repeat fetches between navigations.

import axiosInstance from "../api/axios";

const CACHE_KEY = 'globePointsCache-v1';
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
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch {}
}

export async function getGlobePoints({ ttlMs = DEFAULT_TTL } = {}) {
  const now = Date.now();

  if (inMemory.points && inMemory.expiresAt > now) return inMemory.points;

  const stored = readStorage();
  if (stored && stored.points && stored.expiresAt > now) {
    inMemory.points = stored.points;
    inMemory.expiresAt = stored.expiresAt;
    return stored.points;
  }

  if (inMemory.pending) return inMemory.pending;

  inMemory.pending = axiosInstance
    .get("/cases/last-points")
    .then((res) => {
      const points = res?.data?.points || [];
      const expiresAt = Date.now() + ttlMs;
      inMemory.points = points;
      inMemory.expiresAt = expiresAt;
      writeStorage({ points, expiresAt });
      return points;
    })
    .finally(() => {
      inMemory.pending = null;
    });

  return inMemory.pending;
}

export function clearGlobePointsCache() {
  inMemory = { points: null, expiresAt: 0, pending: null };
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

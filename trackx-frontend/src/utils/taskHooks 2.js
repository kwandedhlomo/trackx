const STORAGE_KEY = "trackxTaskHook";

export const setTaskHook = (payload) => {
  if (!payload) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  try {
    const enriched = {
      ...payload,
      createdAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(enriched));
  } catch (error) {
    console.warn("Unable to set task hook:", error);
  }
};

export const consumeTaskHook = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed?.stage) return null;
    const age = Date.now() - (parsed.createdAt || 0);
    if (age > 5 * 60 * 1000) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Unable to consume task hook:", error);
    return null;
  }
};


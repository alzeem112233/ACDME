export function readLocalData(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function clearLocalData(key) {
  localStorage.removeItem(key);
}

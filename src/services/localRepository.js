export function readLocalData(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("[QZ:local-storage-write]", error, { key });
    return false;
  }
}

export function clearLocalData(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error("[QZ:local-storage-clear]", error, { key });
  }
}

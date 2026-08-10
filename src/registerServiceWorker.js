export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => registration.update().catch(() => null))
      .catch(() => {
        // The app should keep working even if offline caching is unavailable.
      });
  });
}

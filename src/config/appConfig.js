export const appConfig = {
  name: import.meta.env.VITE_APP_NAME || "Al-Qaisar Master Dashboard",
  env: import.meta.env.VITE_APP_ENV || "development",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "",
  enableDemoData: import.meta.env.VITE_ENABLE_DEMO_DATA !== "false",
};

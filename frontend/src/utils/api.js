// api.js
const isCloud =
  window.location.hostname.endsWith("azurestaticapps.net") ||
  window.location.hostname.endsWith("tesis-monitoring.xyz");

export const BACKEND = isCloud
  ? "https://api.tesis-monitoring.xyz"
  : `http://${window.location.hostname}:5000`;

export async function apiFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const res = await fetch(`${BACKEND}${path}`, { ...opts, headers });
  return res;
}

// Resuelve URLs de logos al BACKEND correcto (local o cloud).
// URLs antiguas con IP local o cualquier host que apunten a /static/uploads/
// se reescriben usando el BACKEND actual para evitar Mixed Content en HTTPS.
export function resolveLogoUrl(logo) {
  if (!logo) return "";
  if (logo.includes("/static/uploads/")) {
    const path = logo.substring(logo.indexOf("/static/uploads/"));
    return `${BACKEND}${path}`;
  }
  if (logo.startsWith("/static/")) return `${BACKEND}${logo}`;
  return logo;
}

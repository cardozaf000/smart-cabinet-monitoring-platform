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

// Resuelve URLs de logos: rutas relativas /static/uploads/* se prefijan con BACKEND.
// URLs externas (http/https) y rutas del public folder (/logos/*) se devuelven tal cual.
export function resolveLogoUrl(logo) {
  if (!logo) return "";
  if (logo.startsWith("http://") || logo.startsWith("https://")) return logo;
  if (logo.startsWith("/static/")) return `${BACKEND}${logo}`;
  return logo;
}

// api.js
const isCloud = window.location.hostname.endsWith("azurestaticapps.net");

export const BACKEND = isCloud
  ? "https://api.tesis-monitoring.xyz/"
  : `http://${window.location.hostname}:5000`;

export async function apiFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const res = await fetch(`${BACKEND}${path}`, { ...opts, headers });
  return res;
}

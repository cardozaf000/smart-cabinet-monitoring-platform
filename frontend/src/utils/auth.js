export function saveSession(token, user) {
  if (token) localStorage.setItem("auth_token", token);
  if (user)  localStorage.setItem("auth_user", JSON.stringify(user));
}
export function getToken() {
  return localStorage.getItem("auth_token");
}
export function getUser() {
  const raw = localStorage.getItem("auth_user");
  return raw ? JSON.parse(raw) : null;
}
export function isAuthenticated() {
  return !!getToken();
}
export async function logout() {
  // Registrar logout en auditoría (best-effort, no bloqueante)
  try {
    const token = getToken();
    if (token) {
      const { BACKEND } = await import("./api");
      await fetch(`${BACKEND}/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch (_) {}
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
}
export function authHeader() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

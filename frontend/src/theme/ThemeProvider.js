import { createContext, useContext, useEffect, useMemo, useRef, useCallback, useState } from "react";
import { themes } from "./themes";
import { isAuthenticated, authHeader } from "../utils/auth";
import { BACKEND } from "../utils/api";

// ============================================================
// Conversión de color: hex → HSL
// ============================================================
function hexToHsl(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
      default: break;
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

// Genera una cadena hsl() lista para CSS
function hsl(h, s, l) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// ============================================================
// Generador de paleta armónica a partir del color principal
//
// Idea: usar el mismo matiz (hue) del primario para todos los
// tonos de fondo, card y borde. La saturación se escala al 20-25%
// de la saturación original para que sea sutil pero perceptible.
// ============================================================
function buildPalette(primaryHex, mode) {
  let [h, s] = hexToHsl(primaryHex);

  // Saturación del fondo: 20% de la del primario, con límites
  const sBg     = Math.max(8,  Math.min(22, s * 0.22));
  const sCard   = Math.max(6,  Math.min(18, s * 0.18));
  const sBorder = Math.max(10, Math.min(28, s * 0.28));
  const sMuted  = Math.max(4,  Math.min(12, s * 0.12));

  if (mode === "dark") {
    return {
      bg:        hsl(h, sBg,     7),   // muy oscuro, sutil tinte
      card:      hsl(h, sCard,   13),  // panel, un poco más claro
      border:    hsl(h, sBorder, 22),  // borde visible
      text:      hsl(h, 6,       94),  // casi blanco
      textMuted: hsl(h, sMuted,  55),  // gris medio con tinte
    };
  } else {
    return {
      bg:        hsl(h, Math.max(4, sBg * 0.6),     97),  // casi blanco
      card:      hsl(h, Math.max(3, sCard * 0.4),   100), // blanco puro con tintito
      border:    hsl(h, Math.max(6, sBorder * 0.6), 85),  // borde suave
      text:      hsl(h, 15,                         8),   // casi negro
      textMuted: hsl(h, sMuted,                     42),  // gris legible
    };
  }
}

// ============================================================
// Aplica todas las variables CSS al <html>
// ============================================================
function applyCssVars(theme, mode) {
  const root = document.documentElement;
  const p    = buildPalette(theme.primaryColor, mode);

  root.style.setProperty("--color-primary",    theme.primaryColor);
  root.style.setProperty("--color-accent",     theme.accentColor);
  root.style.setProperty("--color-bg",         p.bg);
  root.style.setProperty("--color-card",       p.card);
  root.style.setProperty("--color-border",     p.border);
  root.style.setProperty("--color-text",       p.text);
  root.style.setProperty("--color-text-muted", p.textMuted);

  // Alias y extras
  root.style.setProperty("--bg-dark",      p.bg);
  root.style.setProperty("--danger-color", "#ef4444");
  root.setAttribute("data-mode", mode);
}

// ============================================================
// Contexto
// ============================================================
const ThemeContext = createContext({
  themeKey:                   "default",
  theme:                      themes.default,
  themeMode:                  "dark",
  toggleThemeMode:            () => {},
  setThemeKey:                () => {},
  setCustomTheme:             () => {},
  loadPreferencesFromBackend: () => {},
});

export const ThemeProvider = ({ children }) => {
  const [themeKey,    setThemeKey]    = useState(() => localStorage.getItem("themeKey")  || "default");
  const [themeMode,   setThemeMode]   = useState(() => localStorage.getItem("themeMode") || "dark");
  const [customTheme, setCustomTheme] = useState(() => {
    const raw = localStorage.getItem("customTheme");
    return raw ? JSON.parse(raw) : null;
  });

  // Evita guardar en backend antes de que carguen las preferencias del servidor
  const backendLoadedRef = useRef(false);

  // Refs para acceder al estado actual desde dentro de callbacks async
  const themeKeyRef     = useRef(themeKey);
  const themeModeRef    = useRef(themeMode);
  const customThemeRef  = useRef(customTheme);
  useEffect(() => { themeKeyRef.current    = themeKey;    }, [themeKey]);
  useEffect(() => { themeModeRef.current   = themeMode;   }, [themeMode]);
  useEffect(() => { customThemeRef.current = customTheme; }, [customTheme]);

  const theme = useMemo(() => {
    // Los temas del servidor se guardan en customTheme con su key real
    if (customTheme && customTheme.key === themeKey) return customTheme;
    return themes[themeKey] || themes.default;
  }, [themeKey, customTheme]);

  // Persistir selección en localStorage
  useEffect(() => { localStorage.setItem("themeKey", themeKey); }, [themeKey]);
  useEffect(() => {
    if (customTheme) localStorage.setItem("customTheme", JSON.stringify(customTheme));
  }, [customTheme]);

  // Aplicar variables CSS cada vez que cambia tema o modo
  useEffect(() => {
    localStorage.setItem("themeMode", themeMode);
    applyCssVars(theme, themeMode);
  }, [theme, themeMode]);

  // Guardar en backend cuando cambian las preferencias (solo tras carga inicial)
  useEffect(() => {
    if (!backendLoadedRef.current || !isAuthenticated()) return;
    fetch(`${BACKEND}/api/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ themeKey, themeMode, customTheme }),
    }).catch(() => {});
  }, [themeKey, themeMode, customTheme]); // eslint-disable-line

  // Cargar preferencias del backend (llama después del login)
  const loadPreferencesFromBackend = useCallback(() => {
    if (!isAuthenticated()) return;
    fetch(`${BACKEND}/api/preferences`, { headers: authHeader() })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && data.saved) {
          // Hay preferencias guardadas → aplicarlas
          if (data.themeKey)    setThemeKey(data.themeKey);
          if (data.themeMode)   setThemeMode(data.themeMode);
          if (data.customTheme) setCustomTheme(data.customTheme);
          backendLoadedRef.current = true;
        } else {
          // Sin preferencias en BD → solo guardar si este navegador tiene tema
          // configurado explícitamente (evita que incógnito pise con "default")
          backendLoadedRef.current = true;
          if (localStorage.getItem("themeKey") !== null) {
            fetch(`${BACKEND}/api/preferences`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", ...authHeader() },
              body: JSON.stringify({
                themeKey:    themeKeyRef.current,
                themeMode:   themeModeRef.current,
                customTheme: customThemeRef.current,
              }),
            }).catch(() => {});
          }
        }
      })
      .catch(() => { backendLoadedRef.current = true; });
  }, []);

  // Intentar cargar al montar si ya hay sesión activa (refresh de página)
  useEffect(() => {
    loadPreferencesFromBackend();
  }, []); // eslint-disable-line

  const toggleThemeMode = () =>
    setThemeMode((prev) => (prev === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ themeKey, theme, themeMode, toggleThemeMode, setThemeKey, setCustomTheme, loadPreferencesFromBackend }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

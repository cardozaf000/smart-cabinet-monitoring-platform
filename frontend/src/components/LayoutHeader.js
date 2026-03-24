import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getUser, logout } from "../utils/auth";
import {
  FiChevronLeft, FiLogOut, FiCpu, FiGrid, FiBell,
  FiShield, FiSliders, FiSun, FiMoon, FiServer, FiActivity,
  FiUser, FiEye, FiAlertOctagon, FiArchive,
} from "react-icons/fi";
import { useTheme } from "../theme/ThemeProvider";
import { BACKEND } from "../utils/api";

// ============================================================
// Navegación
// ============================================================
const NAV_MAIN = [
  { key: "sensors",   label: "Sensores",       icon: FiCpu          },
  { key: "cabinets",  label: "Gabinetes",       icon: FiGrid         },
  { key: "network",   label: "Config. de Red",  icon: FiServer       },
  { key: "alerts",    label: "Alertas",         icon: FiBell         },
  { key: "incidents", label: "Incidencias",     icon: FiAlertOctagon },
];
const NAV_ADMIN = [
  { key: "usuarios",  label: "Usuarios",   icon: FiUser    },
  { key: "auditoria", label: "Auditoría",  icon: FiShield  },
  { key: "visual",    label: "Visual",     icon: FiSliders },
  { key: "backup",    label: "Backup",     icon: FiArchive },
];

// ============================================================
// Badge de rol
// ============================================================
const ROL_STYLE = {
  superadmin: { text: "#f59e0b", label: "Superadmin", Icon: FiShield },
  admin:      { text: "#818cf8", label: "Admin",       Icon: FiShield },
  operador:   { text: "#34d399", label: "Operador",    Icon: FiUser   },
  viewer:     { text: "#9ca3af", label: "Viewer",      Icon: FiEye    },
};

// ============================================================
// Avatar
// ============================================================
function Avatar({ nombre, username, size = 30 }) {
  const raw      = (nombre || username || "?").trim();
  const initials = raw.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0 select-none"
      style={{
        width:  size,
        height: size,
        fontSize: size * 0.38,
        backgroundColor: "color-mix(in srgb, var(--color-primary) 22%, transparent)",
        color:           "var(--color-primary)",
        border:          "1.5px solid color-mix(in srgb, var(--color-primary) 35%, transparent)",
      }}
    >
      {initials}
    </div>
  );
}

// ============================================================
// Tooltip para modo colapsado
// ============================================================
function Tooltip({ label, children }) {
  const [visible, setVisible] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap pointer-events-none"
            style={{
              backgroundColor: "var(--color-primary)",
              color:           "#fff",
              boxShadow:       "0 4px 12px rgba(0,0,0,0.3)",
              zIndex:          9999,
            }}
          >
            {label}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Indicador online
// ============================================================
function OnlineIndicator({ online }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-medium mt-0.5">
      {online ? (
        <>
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ backgroundColor: "#10b981" }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5"
              style={{ backgroundColor: "#10b981" }} />
          </span>
          <span style={{ color: "#10b981" }}>En línea</span>
        </>
      ) : (
        <>
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: "#ef4444" }} />
          <span style={{ color: "#ef4444" }}>Sin conexión</span>
        </>
      )}
    </span>
  );
}

// ============================================================
// Toggle tema
// ============================================================
function ToggleThemeButton({ compact }) {
  const { themeMode, toggleThemeMode } = useTheme();
  const isDark = themeMode === "dark";
  return (
    <button
      onClick={toggleThemeMode}
      className="flex items-center justify-center gap-2 rounded-lg border transition-colors focus:outline-none"
      style={{
        width:           "100%",
        height:          36,
        backgroundColor: "var(--color-bg)",
        color:           "var(--color-text-muted, #9ca3af)",
        borderColor:     "var(--color-border)",
        fontSize:        12,
      }}
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      {isDark ? <FiSun size={15} /> : <FiMoon size={15} />}
      {!compact && <span>{isDark ? "Modo claro" : "Modo oscuro"}</span>}
    </button>
  );
}

// ============================================================
// NavButton — icono fijo, label con transición CSS
// ============================================================
function NavButton({ itemKey, label, Icon, active, onClick, collapsed, themeMode }) {
  return (
    <button
      data-nav-key={itemKey}
      onClick={onClick}
      className="relative z-10 w-full flex items-center rounded-lg font-medium focus:outline-none transition-colors"
      style={{
        height:          40,
        paddingLeft:     12,
        paddingRight:    12,
        color:           active
          ? (themeMode === "dark" ? "#fff" : "#111")
          : "var(--color-text-muted, #9ca3af)",
        backgroundColor: "transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor =
          themeMode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {/* Icono: contenedor de ancho fijo, nunca se mueve */}
      <span className="shrink-0 flex items-center justify-center" style={{ width: 20, height: 20 }}>
        <Icon size={17} />
      </span>

      {/* Label: transición CSS de max-width, sin reflow del icono */}
      <span
        style={{
          marginLeft:         collapsed ? 0 : 10,
          maxWidth:           collapsed ? 0 : 180,
          opacity:            collapsed ? 0 : 1,
          overflow:           "hidden",
          whiteSpace:         "nowrap",
          fontSize:           14,
          transitionProperty: "max-width, opacity, margin-left",
          transitionDuration: "220ms",
          transitionTimingFunction: "ease",
        }}
      >
        {label}
      </span>
    </button>
  );
}

// ============================================================
// Componente principal
// ============================================================
export default function LayoutHeader({ currentPage, onNavigate, collapsed, setCollapsed }) {
  const navigate = useNavigate();
  const { theme, themeMode } = useTheme();
  const user = getUser();

  const [logoSrc, setLogoSrc] = useState("");
  const [appName, setAppName] = useState("");
  const [online,  setOnline]  = useState(navigator.onLine);

  const navRef = useRef(null);
  const [activeRect, setActiveRect] = useState(null);

  // ---- Branding ----
  useEffect(() => {
    fetch(`${BACKEND}/branding`)
      .then((r) => r.json())
      .then((d) => {
        setLogoSrc(d.sidebar_logo || theme.logo || "");
        setAppName(d.app_name    || theme.name  || "");
      })
      .catch(() => {
        setLogoSrc(theme.logo || "");
        setAppName(theme.name || "");
      });
  }, [theme.logo, theme.name]);

  // ---- Online/offline ----
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online",  on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // ---- Persistencia colapso ----
  useEffect(() => {
    const s = localStorage.getItem("sidebar_collapsed");
    if (s !== null && setCollapsed) setCollapsed(s === "1");
  }, [setCollapsed]);
  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  const handleLogout = async () => { await logout(); navigate("/login", { replace: true }); };

  // ---- Items de nav ----
  const ALL_NAV = useMemo(() => {
    const items = [...NAV_MAIN];
    if (user?.rol === "admin" || user?.rol === "superadmin") {
      items.push({ key: "divider-admin", type: "divider", label: "Administración" });
      items.push(...NAV_ADMIN);
    }
    return items;
  }, [user?.rol]);

  // ---- Indicador activo ----
  const updateActiveRect = useCallback(() => {
    requestAnimationFrame(() => {
      const btn = navRef.current?.querySelector(`[data-nav-key="${currentPage}"]`);
      const nav = navRef.current;
      if (btn && nav) {
        const r  = btn.getBoundingClientRect();
        const nr = nav.getBoundingClientRect();
        setActiveRect({ top: r.top - nr.top, height: r.height });
      } else {
        setActiveRect(null);
      }
    });
  }, [currentPage]);

  useEffect(() => {
    updateActiveRect();
    const t = setTimeout(updateActiveRect, 120);
    window.addEventListener("resize", updateActiveRect);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", updateActiveRect);
    };
  }, [currentPage, collapsed, updateActiveRect]);

  const rol   = (user?.rol || "viewer").toLowerCase();
  const rolSt = ROL_STYLE[rol] || ROL_STYLE.viewer;
  const RolIcon = rolSt.Icon;

  // ============================================================
  return (
    <>
      {/* ── Sidebar ──
          SIN overflow-hidden: necesario para que el botón de colapso
          en right:-12px no quede recortado por el borde del aside.
          Cada sección maneja su propio overflow internamente.
      */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 240 }}
        transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
        className="fixed inset-y-0 left-0 flex flex-col z-40"
        style={{
          backgroundColor: "var(--color-card)",
          borderRight:     "1px solid var(--color-border)",
          color:           "var(--color-text)",
          boxShadow:       themeMode === "dark"
            ? "4px 0 20px rgba(0,0,0,0.45)"
            : "4px 0 16px rgba(0,0,0,0.07)",
        }}
      >
        {/* ── LOGO / HEADER ── */}
        <div
          className="flex flex-col items-center pt-5 pb-4 relative shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          {/* Logo */}
          <div
            className="rounded-xl flex items-center justify-center shrink-0"
            style={{
              width:  44,
              height: 44,
              backgroundColor: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
              border:          "1px solid color-mix(in srgb, var(--color-primary) 22%, transparent)",
              overflow:        "hidden",
            }}
          >
            {logoSrc ? (
              <img
                src={logoSrc}
                alt="Logo"
                style={{ width: 36, height: 36, objectFit: "contain" }}
                onError={() => setLogoSrc("")}
              />
            ) : (
              <FiActivity size={20} style={{ color: "var(--color-primary)" }} />
            )}
          </div>

          {/* Nombre + online — transición CSS, sin AnimatePresence */}
          <div
            style={{
              maxHeight:          collapsed ? 0 : 52,
              opacity:            collapsed ? 0 : 1,
              overflow:           "hidden",
              marginTop:          collapsed ? 0 : 8,
              textAlign:          "center",
              paddingLeft:        8,
              paddingRight:       8,
              transitionProperty: "max-height, opacity, margin-top",
              transitionDuration: "220ms",
              transitionTimingFunction: "ease",
            }}
          >
            <p
              style={{
                fontSize:   12,
                fontWeight: 700,
                color:      "var(--color-text)",
                whiteSpace: "nowrap",
                overflow:   "hidden",
                textOverflow: "ellipsis",
                maxWidth:   180,
              }}
            >
              {appName || "Sistema de Monitoreo"}
            </p>
            <OnlineIndicator online={online} />
          </div>

          {/* ── Botón colapsar ──
              z-50 y posición absoluta fuera del aside.
              Como el aside NO tiene overflow:hidden, no se recorta.
          */}
          <motion.button
            onClick={() => setCollapsed((v) => !v)}
            className="absolute flex items-center justify-center rounded-full border shadow focus:outline-none"
            style={{
              right:           -13,
              top:             "50%",
              transform:       "translateY(-50%)",
              width:           26,
              height:          26,
              backgroundColor: "var(--color-card)",
              borderColor:     "var(--color-border)",
              color:           "var(--color-text-muted, #888)",
              zIndex:          50,
            }}
            animate={{ rotate: collapsed ? 0 : 180 }}
            whileHover={{ scale: 1.15, backgroundColor: "var(--color-primary)", color: "#fff" }}
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.25 }}
            title={collapsed ? "Expandir" : "Contraer"}
          >
            <FiChevronLeft size={13} />
          </motion.button>
        </div>

        {/* ── NAVEGACIÓN ── */}
        <nav
          ref={navRef}
          className="flex-1 py-2 relative"
          style={{
            paddingLeft:  8,
            paddingRight: 8,
            overflowY:    "auto",
            overflowX:    "hidden",
            scrollbarWidth: "none",
          }}
        >
          {/* Barra indicador activo */}
          <AnimatePresence>
            {activeRect && (
              <motion.div
                key="active-bar"
                className="absolute rounded-lg pointer-events-none"
                style={{
                  left:   8,
                  right:  8,
                  top:    activeRect.top,
                  height: activeRect.height,
                  zIndex: 0,
                  background: `linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 70%, var(--color-accent)))`,
                  boxShadow:  `0 0 14px color-mix(in srgb, var(--color-primary) 40%, transparent)`,
                }}
                initial={{ opacity: 0, scaleX: 0.88 }}
                animate={{ opacity: 1, scaleX: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 340, damping: 30 }}
              />
            )}
          </AnimatePresence>

          {/* Items */}
          {ALL_NAV.map((item) => {
            if (item.type === "divider") {
              return (
                <div
                  key={item.key}
                  style={{
                    // Solo en modo expandido hay padding superior para el label
                    paddingTop:    collapsed ? 8 : 16,
                    paddingBottom: 4,
                    paddingLeft:   collapsed ? 0 : 4,
                    paddingRight:  collapsed ? 0 : 4,
                  }}
                >
                  {/* Label "Administración" visible solo expandido */}
                  <div
                    style={{
                      maxHeight:          collapsed ? 0 : 20,
                      opacity:            collapsed ? 0 : 1,
                      overflow:           "hidden",
                      transitionProperty: "max-height, opacity",
                      transitionDuration: "200ms",
                    }}
                  >
                    <span
                      style={{
                        fontSize:      10,
                        fontWeight:    700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color:         "var(--color-text-muted, #6b7280)",
                        paddingLeft:   8,
                      }}
                    >
                      {item.label}
                    </span>
                  </div>

                  {/* Línea visible solo colapsado */}
                  <div
                    style={{
                      borderTop:          "1px solid var(--color-border)",
                      opacity:            collapsed ? 1 : 0,
                      transitionProperty: "opacity",
                      transitionDuration: "200ms",
                      marginTop:          collapsed ? 0 : -4,
                    }}
                  />
                </div>
              );
            }

            const btn = (
              <NavButton
                key={item.key}
                itemKey={item.key}
                label={item.label}
                Icon={item.icon}
                active={currentPage === item.key}
                onClick={() => onNavigate(item.key)}
                collapsed={collapsed}
                themeMode={themeMode}
              />
            );

            return collapsed
              ? <Tooltip key={item.key} label={item.label}>{btn}</Tooltip>
              : <React.Fragment key={item.key}>{btn}</React.Fragment>;
          })}
        </nav>

        {/* ── FOOTER ── */}
        <div
          className="shrink-0 flex flex-col"
          style={{
            borderTop: "1px solid var(--color-border)",
            padding:   8,
            gap:       6,
          }}
        >
          {/* Toggle modo */}
          {collapsed ? (
            <Tooltip label={themeMode === "dark" ? "Modo claro" : "Modo oscuro"}>
              <ToggleThemeButton compact />
            </Tooltip>
          ) : (
            <ToggleThemeButton compact={false} />
          )}

          {/* Usuario + logout */}
          <div
            style={{
              display:         "flex",
              alignItems:      "center",
              borderRadius:    8,
              padding:         "6px 8px",
              gap:             collapsed ? 6 : 8,
              backgroundColor: "color-mix(in srgb, var(--color-primary) 6%, transparent)",
              // En colapsado centramos los dos elementos
              justifyContent:  collapsed ? "center" : "flex-start",
            }}
          >
            {/* Avatar — siempre visible, tamaño según estado */}
            <Avatar
              nombre={user?.nombre}
              username={user?.username}
              size={collapsed ? 26 : 30}
            />

            {/* Nombre + rol — transición CSS */}
            <div
              style={{
                flex:               1,
                minWidth:           0,
                overflow:           "hidden",
                maxWidth:           collapsed ? 0 : 120,
                opacity:            collapsed ? 0 : 1,
                transitionProperty: "max-width, opacity",
                transitionDuration: "200ms",
              }}
            >
              <p
                style={{
                  fontSize:     12,
                  fontWeight:   600,
                  color:        "var(--color-text)",
                  whiteSpace:   "nowrap",
                  overflow:     "hidden",
                  textOverflow: "ellipsis",
                  lineHeight:   1.3,
                }}
              >
                {user?.username || "Invitado"}
              </p>
              <span
                style={{
                  display:    "flex",
                  alignItems: "center",
                  gap:        4,
                  fontSize:   10,
                  fontWeight: 600,
                  color:      rolSt.text,
                }}
              >
                <RolIcon size={10} />
                {rolSt.label}
              </span>
            </div>

            {/* Logout — siempre visible, sin Tooltip wrapper */}
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              style={{
                flexShrink:      0,
                width:           collapsed ? 26 : 28,
                height:          collapsed ? 26 : 28,
                display:         "flex",
                alignItems:      "center",
                justifyContent:  "center",
                borderRadius:    6,
                border:          "none",
                backgroundColor: "transparent",
                cursor:          "pointer",
                color:           "var(--color-text-muted, #9ca3af)",
                transition:      "background-color 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "color-mix(in srgb, #ef4444 15%, transparent)";
                e.currentTarget.style.color = "#ef4444";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--color-text-muted, #9ca3af)";
              }}
            >
              <FiLogOut size={13} />
            </button>
          </div>
        </div>
      </motion.aside>
    </>
  );
}

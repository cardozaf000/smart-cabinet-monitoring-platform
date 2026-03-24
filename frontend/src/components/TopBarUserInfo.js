import React, { useState, useEffect } from "react";
import { getUser } from "../utils/auth";
import { useTheme } from "../theme/ThemeProvider";
import {
  FiCpu, FiGrid, FiServer, FiBell,
  FiUser, FiSliders, FiActivity,
  FiShield, FiEye,
} from "react-icons/fi";

// ============================================================
// Mapa de páginas → info
// ============================================================
const PAGE_INFO = {
  sensors:  { label: "Sensores",         Icon: FiCpu     },
  cabinets: { label: "Gabinetes",         Icon: FiGrid    },
  network:  { label: "Config. de Red",    Icon: FiServer  },
  alerts:   { label: "Alertas",           Icon: FiBell    },
  usuarios: { label: "Usuarios",          Icon: FiUser    },
  visual:   { label: "Configuración Visual", Icon: FiSliders },
};

// ============================================================
// Badge de rol
// ============================================================
const ROL_STYLE = {
  admin:    { bg: "#6366f122", text: "#818cf8", border: "#6366f140", label: "Administrador", Icon: FiShield  },
  operador: { bg: "#10b98122", text: "#34d399", border: "#10b98140", label: "Operador",       Icon: FiUser   },
  viewer:   { bg: "#6b728022", text: "#9ca3af", border: "#6b728040", label: "Solo lectura",   Icon: FiEye    },
};

function RolBadge({ rol }) {
  const r  = (rol || "viewer").toLowerCase();
  const st = ROL_STYLE[r] || ROL_STYLE.viewer;
  const Icon = st.Icon;
  return (
    <span
      className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}` }}
    >
      <Icon size={10} /> {st.label}
    </span>
  );
}

// ============================================================
// Avatar con iniciales
// ============================================================
function Avatar({ nombre, username }) {
  const raw      = (nombre || username || "?").trim();
  const initials = raw.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 select-none"
      style={{
        backgroundColor: "rgba(255,255,255,0.2)",
        color: "#fff",
        border: "1.5px solid rgba(255,255,255,0.35)",
      }}
    >
      {initials}
    </div>
  );
}

// ============================================================
// Reloj en tiempo real
// ============================================================
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = time.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const dateStr = time.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="hidden md:flex flex-col items-end leading-tight">
      <span className="text-sm font-bold text-white/90">{timeStr}</span>
      <span className="text-[10px] text-white/60 capitalize">{dateStr}</span>
    </div>
  );
}

// ============================================================
// Componente principal
// ============================================================
export default function TopBarUserInfo({ currentPage }) {
  const user    = getUser();
  const { theme } = useTheme();

  const info = PAGE_INFO[currentPage] || { label: theme.name || "Sistema de Monitoreo IoT", Icon: FiActivity };
  const Icon = info.Icon;

  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 rounded-xl"
      style={{
        background: `linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 65%, var(--color-accent)))`,
        boxShadow: "0 4px 20px color-mix(in srgb, var(--color-primary) 35%, transparent)",
      }}
    >
      {/* Título de la sección */}
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
        >
          <Icon size={16} color="#fff" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">{info.label}</p>
          <p className="text-[10px] text-white/60 hidden sm:block">
            {theme.name || "Sistema de Monitoreo IoT"}
          </p>
        </div>
      </div>

      {/* Lado derecho: reloj + usuario */}
      <div className="flex items-center gap-4">
        <LiveClock />

        {user && (
          <div className="flex items-center gap-2.5">
            <RolBadge rol={user.rol} />
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-xs font-semibold text-white">{user.username}</span>
            </div>
            <Avatar nombre={user.nombre} username={user.username} />
          </div>
        )}
      </div>
    </div>
  );
}

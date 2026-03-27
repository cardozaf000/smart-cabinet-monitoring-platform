// ==========================================================
// 🌐 APP.JS — Compatible con LAN (http) y Cloud (https)
// ==========================================================
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LayoutHeader from "./components/LayoutHeader";
import SensorManagement from "./components/SensorManagement";
import CabinetManagement from "./components/CabinetManagement";
import AlertsPage from "./components/AlertsPage";
import IncidentsPage from "./components/IncidentsPage";
import NetworkConfig from "./components/NetworkConfig";
import UsersAdmin from "./components/UsersAdmin";
import AuditLog from "./components/AuditLog";
import VisualSettings from "./components/VisualSettings";
import BackupRestore from "./components/BackupRestore";
import TopBarUserInfo from "./components/TopBarUserInfo";
import PrivateRoute from "./components/PrivateRoute";
import LoginPage from "./components/LoginPage";

import { useTheme } from "./theme/ThemeProvider";
import { updateItemInList, deleteItemFromList, addItemToList } from "./utils/helpers";
import { isAuthenticated, getUser, authHeader, logout, getTokenExpiry } from "./utils/auth";
import { BACKEND } from "./utils/api"; // ✅ usa la API centralizada

// ==========================================================
// 🌐 Configuración: LAN (http) / Cloudflare (https)
// ==========================================================
const App = () => {
  // --- UI / Navegación ---
  const [currentPage, setCurrentPage] = useState(() => {
    const stored = localStorage.getItem("currentPage") || "sensors";
    // Migrar rutas renombradas / eliminadas
    if (stored === "mqtt") return "network";
    if (stored === "seguridad") return "sensors";
    if (stored === "dashboards") return "sensors";
    return stored;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar_collapsed") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // --- Estado de sesión / datos ---
  const [user, setUser] = useState(null);
  const [cabinets, setCabinets] = useState([]);
  const [sensors, setSensors] = useState([]);
  const [lecturas, setLecturas] = useState([]);

  // --- Preferencias globales ---
  const [settings, setSettings] = useState({
    theme: "dark",
    notifications: false,
    syncWithZabbix: false,
  });

  const { theme, loadPreferencesFromBackend } = useTheme();

  // --- Persistencia de UI ---
  useEffect(() => localStorage.setItem("currentPage", currentPage), [currentPage]);
  useEffect(() => localStorage.setItem("sidebar_collapsed", sidebarCollapsed ? "1" : "0"), [sidebarCollapsed]);

  // --- Cargar usuario si existe sesión válida ---
  useEffect(() => {
    const u = getUser();
    if (u) setUser(u);
  }, []);

  // --- Auto-logout cuando expira el JWT ---
  useEffect(() => {
    if (!isAuthenticated()) return;
    const expiry = getTokenExpiry();
    if (!expiry) return;
    const remaining = expiry - Date.now();
    if (remaining <= 0) {
      logout().then(() => { window.location.href = "/login"; });
      return;
    }
    const t = setTimeout(() => {
      logout().then(() => { window.location.href = "/login"; });
    }, remaining);
    return () => clearTimeout(t);
  }, []);

  // --- Cargar gabinetes desde backend ---
  useEffect(() => {
    if (!isAuthenticated()) return;
    fetch(`${BACKEND}/api/gabinetes`)   // GET público, sin Authorization para evitar preflight
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data) && data.length > 0) setCabinets(data); })
      .catch(() => {});
  }, []);

  // --- Control de visibilidad ---
  const visibilityRef = useRef(!document.hidden);
  useEffect(() => {
    const onVisibility = () => (visibilityRef.current = !document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // ==========================================================
  // 🔁 Polling de sensores
  // ==========================================================
  useEffect(() => {
    if (!isAuthenticated() || (currentPage !== "sensors" && currentPage !== "cabinets")) return;

    let isMounted = true;
    const controller = new AbortController();

    const fetchSensores = async () => {
      if (!visibilityRef.current) return;
      try {
        const res = await fetch(`${BACKEND}/datos_sensores`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Filtrar lecturas duplicadas (quedarse con la más reciente)
        const map = new Map();
        for (const item of data) {
          const key = `${item.sensor_id}-${item.tipo}`;
          const ts = new Date(item?.lectura?.timestamp || 0).getTime();
          const prevTs = new Date(map.get(key)?.lectura?.timestamp || 0).getTime();
          if (!map.has(key) || ts > prevTs) {
            map.set(key, {
              id: item.sensor_id,
              name: item.nombre,
              type: item.tipo,
              pin: item.pin ?? null,
              cabinetId: item.cabinetId ?? "cab-desconocido",
              status: item.status ?? "OK",
              lectura: {
                valor: item?.lectura?.valor ?? null,
                unidad: item?.lectura?.unidad ?? "",
                timestamp: item?.lectura?.timestamp ?? null,
              },
            });
          }
        }

        if (isMounted) {
          const sensArr = Array.from(map.values());
          setSensors(sensArr);
          setLecturas(data);
        }
      } catch (err) {
        if (err.name !== "AbortError") console.error("Error al obtener sensores:", err);
      }
    };

    fetchSensores();
    const intervalId = setInterval(fetchSensores, 2000);
    return () => {
      isMounted = false;
      controller.abort();
      clearInterval(intervalId);
    };
  }, [currentPage]);

  // ==========================================================
  // 🧩 Handlers
  // ==========================================================
  const handleRescanSensors = useCallback(() => {
    const updatedSensors = sensors.map((s) => ({
      ...s,
      status: Math.random() > 0.9 ? "Alerta" : "OK",
    }));
    setSensors(updatedSensors);
    setCabinets((prev) =>
      prev.map((cab) => {
        const cabSensors = updatedSensors.filter((s) => s.cabinetId === cab.id);
        const hasAlert = cabSensors.some((s) => s.status === "Alerta");
        return { ...cab, status: hasAlert ? "Alerta" : "OK", sensors: cabSensors };
      })
    );
  }, [sensors]);

  const handleUpdateSensor = useCallback((id, updatedSensor) => {
    setSensors((prev) => updateItemInList(prev, id, updatedSensor));
    setCabinets((prev) =>
      prev.map((cab) => {
        if (cab.id === updatedSensor.cabinetId) {
          const updatedCabSensors = updateItemInList(cab.sensors || [], id, updatedSensor);
          const hasAlert = updatedCabSensors.some((s) => s.status === "Alerta");
          return { ...cab, sensors: updatedCabSensors, status: hasAlert ? "Alerta" : "OK" };
        }
        return cab;
      })
    );
  }, []);

  const handleDeleteSensor = useCallback((id) => {
    setSensors((prev) => deleteItemFromList(prev, id));
    setCabinets((prev) =>
      prev.map((cab) => {
        const updatedCabSensors = deleteItemFromList(cab.sensors || [], id);
        const hasAlert = updatedCabSensors.some((s) => s.status === "Alerta");
        return { ...cab, sensors: updatedCabSensors, status: hasAlert ? "Alerta" : "OK" };
      })
    );
  }, []);

  const handleAddSensor = useCallback((newSensor) => {
    setSensors((prev) => addItemToList(prev, newSensor));
    setCabinets((prev) =>
      prev.map((cab) => {
        if (cab.id === newSensor.cabinetId) {
          const updatedCabSensors = addItemToList(cab.sensors || [], newSensor);
          const hasAlert = updatedCabSensors.some((s) => s.status === "Alerta");
          return { ...cab, sensors: updatedCabSensors, status: hasAlert ? "Alerta" : "OK" };
        }
        return cab;
      })
    );
  }, []);

  const handleAddCabinet = useCallback((newCabinet) => {
    const cab = { ...newCabinet, sensors: newCabinet.sensors || [], status: newCabinet.status || "OK" };
    setCabinets((prev) => addItemToList(prev, cab));
    fetch(`${BACKEND}/api/gabinetes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ id: cab.id, name: cab.name, location: cab.location, status: cab.status }),
    }).catch(() => {});
  }, []);

  const handleUpdateCabinet = useCallback((id, updatedCabinet) => {
    setCabinets((prev) => updateItemInList(prev, id, updatedCabinet));
    fetch(`${BACKEND}/api/gabinetes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ name: updatedCabinet.name, location: updatedCabinet.location, status: updatedCabinet.status }),
    }).catch(() => {});
  }, []);

  const handleDeleteCabinet = useCallback((id) => {
    setCabinets((prev) => prev.filter((c) => c.id !== id));
    setSensors((prev) => prev.filter((sensor) => sensor.cabinetId !== id));
    fetch(`${BACKEND}/api/gabinetes/${id}`, {
      method: "DELETE",
      headers: authHeader(),
    }).catch(() => {});
  }, []);

  const handleUpdateSettings = useCallback((newSettings) => setSettings(newSettings), []);
  const handleSyncWithZabbix = useCallback(() => alert("Sincronizando con Zabbix... (simulado)"), []);

  // --- Sincroniza estado de gabinetes ---
  useEffect(() => {
    setCabinets((prev) =>
      prev.map((cab) => {
        const cabSensors = sensors.filter((s) => s.cabinetId === cab.id);
        const hasAlert = cabSensors.some((s) => s.status === "Alerta");
        return { ...cab, status: hasAlert ? "Alerta" : "OK", sensors: cabSensors };
      })
    );
  }, [sensors]);

  // ==========================================================
  // 🧱 Layout principal
  // ==========================================================
  const dashboardElement = useMemo(
    () => (
      <div className="flex">
        <LayoutHeader
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          isMobile={isMobile}
        />

        <main
          id="main-content"
          role="main"
          aria-live="polite"
          className="min-h-screen w-full motion-safe:transition-[margin,background-color,color] motion-safe:duration-300"
          style={{
            backgroundColor: "var(--color-bg)",
            color: "var(--color-text)",
            marginLeft: isMobile ? 0 : (sidebarCollapsed ? "72px" : "240px"),
          }}
        >
          <div
            className="sticky top-0 z-30 pb-3 mb-4 border-b"
            style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
          >
            <TopBarUserInfo currentPage={currentPage} onMenuOpen={() => setMobileOpen(true)} />
          </div>

          <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pb-6">
            {/* SensorManagement siempre montado — solo se oculta para preservar estado del grid y SystemStatusCard */}
            <div style={{ display: currentPage === "sensors" ? undefined : "none" }}>
              <SensorManagement
                sensors={sensors}
                lecturas={lecturas}
                onUpdateSensor={handleUpdateSensor}
                onDeleteSensor={handleDeleteSensor}
                onAddSensor={handleAddSensor}
                onRescanSensors={handleRescanSensors}
              />
            </div>
            {currentPage === "cabinets" && (
              <CabinetManagement
                cabinets={cabinets}
                sensors={sensors}
                onAddCabinet={handleAddCabinet}
                onUpdateCabinet={handleUpdateCabinet}
                onDeleteCabinet={handleDeleteCabinet}
              />
            )}
            {currentPage === "network" && <NetworkConfig />}
            {currentPage === "alerts" && <AlertsPage />}
            {currentPage === "incidents" && <IncidentsPage />}
            {currentPage === "usuarios"  && <UsersAdmin />}
            {currentPage === "auditoria" && <AuditLog />}
            {currentPage === "visual" && (
              <VisualSettings settings={settings} onUpdate={handleUpdateSettings} onSync={handleSyncWithZabbix} />
            )}
            {currentPage === "backup" && <BackupRestore />}
          </div>
        </main>
      </div>
    ),
    [
      currentPage,
      sidebarCollapsed,
      mobileOpen,
      isMobile,
      sensors,
      lecturas,
      cabinets,
      settings,
      handleUpdateSensor,
      handleDeleteSensor,
      handleAddSensor,
      handleRescanSensors,
      handleAddCabinet,
      handleUpdateCabinet,
      handleDeleteCabinet,
      handleUpdateSettings,
      handleSyncWithZabbix,
      // backup page no necesita deps extra
    ]
  );

  // ==========================================================
  // 🚀 Rutas
  // ==========================================================
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <LoginPage
              onLogin={(u) => {
                setUser(u || getUser());
                loadPreferencesFromBackend();
              }}
            />
          }
        />
        <Route element={<PrivateRoute />}>
          <Route path="/" element={dashboardElement} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;

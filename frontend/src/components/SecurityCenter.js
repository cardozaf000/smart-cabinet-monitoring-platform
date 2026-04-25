import React, { useState, useEffect } from "react";
import axios from "axios";

const BACKEND = `http://${window.location.hostname}:5000`;
const TABS = ["Redes", "Servicios", "Políticas", "Perfiles", "Aplicar", "Auditoría"];

const SecurityCenter = () => {
  const [currentTab, setCurrentTab] = useState("Redes");

  // === Redes ===
  const [networks, setNetworks] = useState([]);
  const [newCIDR, setNewCIDR] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const fetchNetworks = async () => {
    try {
      const res = await axios.get(`${BACKEND}/security/networks`);
      setNetworks(res.data);
    } catch (err) {
      console.error("Error en fetchNetworks:", err);
    }
  };

  const createNetwork = async () => {
    if (!newCIDR) return alert("CIDR requerido");
    try {
      await axios.post(`${BACKEND}/security/networks`, {
        cidr: newCIDR,
        description: newDesc,
      });
      setNewCIDR(""); setNewDesc("");
      fetchNetworks();
    } catch (err) {
      alert("Error al crear red: " + (err.response?.data?.error || err.message));
    }
  };

  const deleteNetwork = async (id) => {
    if (window.confirm("¿Eliminar red?")) {
      try {
        await axios.delete(`${BACKEND}/security/networks/${id}`);
        fetchNetworks();
      } catch (err) {
        alert("Error al eliminar red: " + (err.response?.data?.error || err.message));
      }
    }
  };

  // === Servicios ===
  const [services, setServices] = useState([]);
  const fetchServices = async () => {
    try {
      const res = await axios.get(`${BACKEND}/security/services`);
      setServices(res.data);
    } catch (err) {
      console.error("Error en fetchServices:", err);
    }
  };

  // === Políticas ===
  const [policies, setPolicies] = useState([]);
  const fetchPolicies = async () => {
    try {
      const res = await axios.get(`${BACKEND}/security/policies`);
      setPolicies(res.data);
    } catch (err) {
      console.error("Error en fetchPolicies:", err);
    }
  };

  // === Perfiles ===
  const applyProfile = async (profile) => {
    try {
      await axios.post(`${BACKEND}/security/profile/${profile}`);
      fetchPolicies();
    } catch (err) {
      alert("Error al aplicar perfil: " + (err.response?.data?.error || err.message));
    }
  };

  // === Aplicar reglas ===
  const applyFirewall = async () => {
    if (window.confirm("¿Aplicar reglas de firewall al sistema?")) {
      try {
        await axios.post(`${BACKEND}/security/apply`);
        alert("Reglas aplicadas correctamente");
      } catch (err) {
        alert("Error al aplicar reglas: " + (err.response?.data?.error || err.message));
      }
    }
  };

  // === Auditoría ===
  const [auditLogs, setAuditLogs] = useState([]);
  const fetchAudit = async () => {
    try {
      const res = await axios.get(`${BACKEND}/security/audit`);
      setAuditLogs(res.data);
    } catch (err) {
      console.error("Error en fetchAudit:", err);
    }
  };

  useEffect(() => {
    fetchNetworks();
    fetchServices();
    fetchPolicies();
    fetchAudit();
  }, []);

  const TabButton = ({ label }) => (
    <button
      onClick={() => setCurrentTab(label)}
      className={`px-4 py-2 font-medium rounded-t-md transition-all border ${
        currentTab === label
          ? "bg-[var(--color-primary)] text-white"
          : "bg-[var(--color-card)] text-[var(--color-text)] border-[var(--color-border)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="p-6 rounded-xl shadow-lg border"
      style={{
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
        borderColor: "var(--color-border)",
      }}
    >
      <h1 className="text-2xl font-bold mb-4 text-[var(--color-primary)]">🔐 Centro de Seguridad</h1>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-[var(--color-border)] pb-2">
        {TABS.map((tab) => (
          <TabButton key={tab} label={tab} />
        ))}
      </div>

      {currentTab === "Redes" && (
        <section>
          <h2 className="text-lg font-semibold mb-3">📡 Redes permitidas</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              className="px-3 py-2 rounded-md border text-sm"
              style={{
                backgroundColor: "var(--color-card)",
                color: "var(--color-text)",
                borderColor: "var(--color-border)",
              }}
              placeholder="CIDR (ej. 192.168.1.0/24)"
              value={newCIDR}
              onChange={(e) => setNewCIDR(e.target.value)}
            />
            <input
              className="px-3 py-2 rounded-md border text-sm"
              style={{
                backgroundColor: "var(--color-card)",
                color: "var(--color-text)",
                borderColor: "var(--color-border)",
              }}
              placeholder="Descripción"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <button
              onClick={createNetwork}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm shadow hover:scale-[1.02] transition"
            >
              Agregar
            </button>
          </div>
          <Table
            headers={["CIDR", "Descripción", ""]}
            rows={networks.map((n) => [
              n.cidr,
              n.description,
              <button
                onClick={() => deleteNetwork(n.id)}
                className="text-red-500 hover:underline text-sm"
              >
                Eliminar
              </button>,
            ])}
          />
        </section>
      )}

      {currentTab === "Servicios" && (
        <section>
          <h2 className="text-lg font-semibold mb-3">🧩 Servicios disponibles</h2>
          <Table
            headers={["Nombre", "Puerto", "Protocolo", "TLS"]}
            rows={services.map((s) => [s.name, s.port, s.protocol, s.tls ? "✅" : "❌"])}
          />
        </section>
      )}

      {currentTab === "Políticas" && (
        <section>
          <h2 className="text-lg font-semibold mb-3">🔗 Políticas ACL</h2>
          <Table
            headers={["Red", "Servicio", "Puerto", "Permitir"]}
            rows={policies.map((p) => [
              p.network_cidr,
              p.service_name,
              p.service_port,
              p.allowed ? "✅" : "❌",
            ])}
          />
        </section>
      )}

      {currentTab === "Perfiles" && (
        <section>
          <h2 className="text-lg font-semibold mb-4">🎛 Aplicar perfil rápido</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => applyProfile("solo_lan")}
              className="bg-blue-600 px-4 py-2 rounded text-white shadow hover:scale-[1.02] transition"
            >
              Perfil: Solo LAN
            </button>
            <button
              onClick={() => applyProfile("cerrado")}
              className="bg-red-700 px-4 py-2 rounded text-white shadow hover:scale-[1.02] transition"
            >
              Perfil: Cerrado
            </button>
          </div>
        </section>
      )}

      {currentTab === "Aplicar" && (
        <section>
          <h2 className="text-lg font-semibold mb-4">🚀 Aplicar reglas de firewall</h2>
          <button
            onClick={applyFirewall}
            className="bg-yellow-600 px-4 py-2 rounded text-white shadow hover:scale-[1.02] transition"
          >
            Aplicar Reglas al Sistema
          </button>
        </section>
      )}

      {currentTab === "Auditoría" && (
        <section>
          <h2 className="text-lg font-semibold mb-3">📜 Historial de auditoría</h2>
          <Table
            headers={["Usuario", "Acción", "Detalle", "Fecha"]}
            rows={auditLogs.map((a) => [
              a.username,
              a.action,
              a.diff_json,
              new Date(a.created_at).toLocaleString(),
            ])}
          />
        </section>
      )}
    </div>
  );
};

const Table = ({ headers = [], rows = [] }) => (
  <div className="overflow-auto rounded-lg border border-[var(--color-border)]">
    <table className="min-w-full text-sm">
      <thead
        className="text-white"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-primary) 20%, black)",
        }}
      >
        <tr>
          {headers.map((h, i) => (
            <th key={i} className="text-left px-4 py-2 whitespace-nowrap">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cols, i) => (
          <tr
            key={i}
            className="border-t hover:bg-[color-mix(in srgb, var(--color-primary) 5%, transparent)] transition"
            style={{ borderColor: "var(--color-border)" }}
          >
            {cols.map((c, j) => (
              <td key={j} className="px-4 py-2 text-[var(--color-text)] whitespace-nowrap">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default SecurityCenter;

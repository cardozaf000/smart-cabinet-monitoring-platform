import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  FiUserPlus, FiEdit2, FiTrash2, FiCheck, FiX,
  FiRefreshCcw, FiShield, FiUser, FiEye, FiSearch,
  FiLock, FiChevronDown, FiChevronRight,
} from "react-icons/fi";
import UserFormModal from "./UserFormModal";
import { authHeader, getUser } from "../utils/auth";
import { BACKEND } from "../utils/api";
import Portal from "./Portal";

// ============================================================
// Rol badge
// ============================================================
const ROL_STYLE = {
  superadmin: { bg: "#f59e0b22", text: "#f59e0b", border: "#f59e0b40", label: "Superadmin",    Icon: FiShield },
  admin:      { bg: "#6366f122", text: "#818cf8", border: "#6366f140", label: "Administrador", Icon: FiShield },
  operador:   { bg: "#10b98122", text: "#34d399", border: "#10b98140", label: "Operador",       Icon: FiUser   },
  viewer:     { bg: "#6b728022", text: "#9ca3af", border: "#6b728040", label: "Solo lectura",   Icon: FiEye    },
};

function RolBadge({ rol }) {
  const r = (rol || "viewer").toLowerCase();
  const st = ROL_STYLE[r] || ROL_STYLE.viewer;
  const Icon = st.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}` }}
    >
      <Icon size={10} />
      {st.label}
    </span>
  );
}

// ============================================================
// Avatar con iniciales
// ============================================================
function Avatar({ nombre, username }) {
  const raw = (nombre || username || "?").trim();
  const initials = raw.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 select-none"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-primary) 20%, transparent)",
        color: "var(--color-primary)",
      }}
    >
      {initials}
    </div>
  );
}

// ============================================================
// Stat card
// ============================================================
function StatCard({ label, value, color }) {
  return (
    <div
      className="rounded-xl border px-4 py-3 flex flex-col gap-1 min-w-[110px]"
      style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}
    >
      <span className="text-2xl font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-xs" style={{ color: "var(--color-text-muted, #888)" }}>
        {label}
      </span>
    </div>
  );
}

// ============================================================
// Modal de edición de usuario
// ============================================================
function EditUserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    nombre:   user.nombre   || "",
    username: user.username || "",
    rol:      user.rol      || "operador",
  });
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd,  setNewPwd]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const field = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.username.trim()) {
      setError("Nombre y usuario son obligatorios.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      await axios.put(`${BACKEND}/users/${user.id}`, form, { headers: authHeader() });
      if (pwdOpen && newPwd.trim()) {
        await axios.patch(
          `${BACKEND}/users/${user.id}/password`,
          { password: newPwd },
          { headers: authHeader() }
        );
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    backgroundColor: "var(--color-bg)",
    color:           "var(--color-text)",
    border:          "1px solid var(--color-border)",
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/50">
      <div
        className="w-full max-w-md rounded-xl shadow-xl border p-6 relative"
        style={{ backgroundColor: "var(--color-card)", color: "var(--color-text)", borderColor: "var(--color-border)" }}
      >
        {/* Cerrar */}
        <button
          className="absolute top-3 right-4 text-xl font-bold hover:text-red-400 transition"
          onClick={onClose}
          style={{ color: "var(--color-accent)" }}
        >
          ×
        </button>

        {/* Header */}
        <h2 className="text-lg font-semibold mb-5 flex items-center gap-2 text-[var(--color-primary)]">
          <FiEdit2 size={16} />
          Editar usuario
        </h2>

        {error && (
          <div className="bg-red-900/30 border border-red-600 text-red-200 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4 text-sm">
          {/* Nombre */}
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: "var(--color-text-muted, #888)" }}>
              Nombre completo
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-md text-sm"
              style={inputStyle}
              value={form.nombre}
              onChange={field("nombre")}
            />
          </div>

          {/* Username */}
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: "var(--color-text-muted, #888)" }}>
              Usuario
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-md text-sm"
              style={inputStyle}
              value={form.username}
              onChange={field("username")}
            />
          </div>

          {/* Rol */}
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: "var(--color-text-muted, #888)" }}>
              Rol
            </label>
            <select
              className="w-full px-3 py-2 rounded-md text-sm"
              style={inputStyle}
              value={form.rol}
              onChange={field("rol")}
            >
              <option value="superadmin">Superadmin</option>
              <option value="admin">Administrador</option>
              <option value="operador">Operador</option>
              <option value="viewer">Solo lectura</option>
            </select>
          </div>

          {/* Cambiar contraseña – colapsable */}
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: "var(--color-border)" }}
          >
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium transition hover:opacity-80"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 8%, transparent)", color: "var(--color-primary)" }}
              onClick={() => { setPwdOpen((o) => !o); setNewPwd(""); }}
            >
              <span className="flex items-center gap-2">
                <FiLock size={13} />
                Cambiar contraseña
              </span>
              {pwdOpen ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
            </button>
            {pwdOpen && (
              <div className="px-4 py-3 space-y-1" style={{ borderTop: "1px solid var(--color-border)" }}>
                <label className="block text-xs font-medium" style={{ color: "var(--color-text-muted, #888)" }}>
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  className="w-full px-3 py-2 rounded-md text-sm"
                  style={inputStyle}
                  placeholder="Dejar vacío para no cambiar"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border text-sm transition hover:opacity-80"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 rounded-md font-semibold text-sm transition hover:opacity-90"
              style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}
            >
              {loading ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
}

// ============================================================
// Componente principal
// ============================================================
export default function UsersAdmin() {
  const [users,         setUsers]         = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [err,           setErr]           = useState("");
  const [search,        setSearch]        = useState("");
  const [createOpen,    setCreateOpen]    = useState(false);
  const [editingUser,   setEditingUser]   = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // id del usuario a eliminar

  const me = getUser(); // { id, username, rol }

  // ---- carga ----
  const load = async () => {
    try {
      setLoading(true);
      setErr("");
      const res = await axios.get(`${BACKEND}/users`, { headers: authHeader() });
      setUsers(res.data);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || "Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ---- delete ----
  const handleDelete = async (id) => {
    try {
      await axios.delete(`${BACKEND}/users/${id}`, { headers: authHeader() });
      setConfirmDelete(null);
      load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || "Error al eliminar");
    }
  };

  // ---- filtro de búsqueda ----
  const q = search.toLowerCase();
  const filtered = users.filter(
    (u) =>
      (u.nombre   || "").toLowerCase().includes(q) ||
      (u.username || "").toLowerCase().includes(q) ||
      (u.rol      || "").toLowerCase().includes(q)
  );

  // ---- stats ----
  const total     = users.length;
  const admins    = users.filter((u) => u.rol === "admin" || u.rol === "superadmin").length;
  const operadors = users.filter((u) => u.rol === "operador").length;
  const viewers   = users.filter((u) => u.rol === "viewer").length;

  // ============================================================
  return (
    <div
      className="p-6 rounded-xl shadow-lg border space-y-5"
      style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", borderColor: "var(--color-border)" }}
    >
      {/* Título */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-[var(--color-primary)]">
          Gestión de Usuarios
        </h2>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-md border transition hover:opacity-80"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
            title="Actualizar"
          >
            <FiRefreshCcw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-md font-semibold text-sm transition hover:opacity-90 text-white"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            <FiUserPlus size={15} />
            Nuevo usuario
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Total"          value={total}     color="var(--color-primary)" />
        <StatCard label="Administradores" value={admins}   color="#818cf8" />
        <StatCard label="Operadores"      value={operadors} color="#34d399" />
        <StatCard label="Solo lectura"    value={viewers}   color="#9ca3af" />
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <FiSearch
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "var(--color-text-muted, #888)" }}
        />
        <input
          type="text"
          placeholder="Buscar por nombre, usuario o rol…"
          className="w-full pl-9 pr-4 py-2 rounded-md text-sm"
          style={{
            backgroundColor: "var(--color-card)",
            color:           "var(--color-text)",
            border:          "1px solid var(--color-border)",
          }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Error */}
      {err && (
        <div className="bg-red-900/30 border border-red-600 text-red-200 p-3 rounded text-sm">
          {err}
        </div>
      )}

      {/* Tabla */}
      <div
        className="overflow-x-auto rounded-lg border"
        style={{ borderColor: "var(--color-border)" }}
      >
        <table className="w-full text-sm" style={{ backgroundColor: "var(--color-card)" }}>
          <thead
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-primary) 20%, black)",
              color: "#fff",
            }}
          >
            <tr className="text-left text-xs uppercase tracking-wide">
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Nombre de acceso</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Creado</th>
              <th className="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const isMe      = me && me.id === u.id;
              const delPending = confirmDelete === u.id;

              return (
                <tr
                  key={u.id}
                  className="border-t transition hover:bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  {/* Nombre + avatar */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar nombre={u.nombre} username={u.username} />
                      <div>
                        <div className="font-medium leading-tight">{u.nombre || "—"}</div>
                        {isMe && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: "color-mix(in srgb, var(--color-primary) 20%, transparent)",
                              color: "var(--color-primary)",
                            }}
                          >
                            Tú
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Username */}
                  <td className="px-4 py-3 font-mono text-sm" style={{ color: "var(--color-text-muted, #888)" }}>
                    @{u.username}
                  </td>

                  {/* Rol */}
                  <td className="px-4 py-3">
                    <RolBadge rol={u.rol} />
                  </td>

                  {/* Creado */}
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text-muted, #888)" }}>
                    {u.creado_en ? new Date(u.creado_en).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {delPending ? (
                      /* Confirmar eliminación inline */
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-xs mr-1" style={{ color: "var(--color-text-muted, #888)" }}>
                          ¿Eliminar?
                        </span>
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="p-1.5 rounded transition hover:bg-red-600/20 text-red-400"
                          title="Confirmar"
                        >
                          <FiCheck size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="p-1.5 rounded transition hover:bg-white/10 text-gray-400"
                          title="Cancelar"
                        >
                          <FiX size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        {/* Editar */}
                        <button
                          onClick={() => setEditingUser(u)}
                          className="p-1.5 rounded transition hover:bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)]"
                          style={{ color: "var(--color-primary)" }}
                          title="Editar"
                        >
                          <FiEdit2 size={14} />
                        </button>

                        {/* Eliminar — deshabilitado para uno mismo */}
                        {!isMe && (
                          <button
                            onClick={() => setConfirmDelete(u.id)}
                            className="p-1.5 rounded transition hover:bg-red-600/20 text-red-400"
                            title="Eliminar"
                          >
                            <FiTrash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm"
                  style={{ color: "var(--color-text-muted, #888)" }}
                >
                  {search ? "Sin resultados para esa búsqueda." : "No hay usuarios registrados."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modales */}
      <UserFormModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={load}
      />

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

import React, { useState } from "react";
import axios from "axios";
import { FiUserPlus } from "react-icons/fi";
import { BACKEND } from "../utils/api";
import Portal from "./Portal";

const UserFormModal = ({ visible, onClose, onCreated }) => {
  const [nombre, setNombre] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("operador");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ==========================================================
  // 🔄 Reset form
  // ==========================================================
  const resetForm = () => {
    setNombre("");
    setUsername("");
    setPassword("");
    setRol("operador");
    setError("");
  };

  // ==========================================================
  // 📤 Enviar formulario
  // ==========================================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nombre || !username || !password) {
      setError("Todos los campos son obligatorios");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("auth_token");

      await axios.post(
        `${BACKEND}/register`,
        { nombre, username, password, rol },
        {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
            "Content-Type": "application/json",
          },
        }
      );

      resetForm();
      onCreated?.();
      onClose?.();
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        "Error al crear usuario";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // 🧱 Render modal
  // ==========================================================
  if (!visible) return null;

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/50">
      <div
        className="w-full max-w-lg rounded-xl shadow-xl border p-6 relative"
        style={{
          backgroundColor: "var(--color-card)",
          color: "var(--color-text)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Botón cerrar */}
        <button
          className="absolute top-3 right-4 text-xl font-bold hover:text-red-400"
          onClick={onClose}
          title="Cerrar"
          style={{ color: "var(--color-accent)" }}
        >
          ×
        </button>

        {/* Título */}
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-[var(--color-primary)]">
          <FiUserPlus /> Crear Nuevo Usuario
        </h2>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-600 text-red-200 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <Field label="Nombre completo">
            <input
              type="text"
              className="w-full px-3 py-2 rounded-md"
              style={{
                backgroundColor: "var(--color-bg)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              placeholder="Ej. Juan Pérez"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
            />
          </Field>

          <Field label="Usuario">
            <input
              type="text"
              className="w-full px-3 py-2 rounded-md"
              style={{
                backgroundColor: "var(--color-bg)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              placeholder="Ej. admin01"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>

          <Field label="Contraseña">
            <input
              type="password"
              className="w-full px-3 py-2 rounded-md"
              style={{
                backgroundColor: "var(--color-bg)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <Field label="Rol">
            <select
              className="w-full px-3 py-2 rounded-md"
              style={{
                backgroundColor: "var(--color-bg)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              value={rol}
              onChange={(e) => setRol(e.target.value)}
            >
              <option value="superadmin">Superadmin</option>
              <option value="admin">Administrador</option>
              <option value="operador">Operador</option>
              <option value="viewer">Solo lectura</option>
            </select>
          </Field>

          <div className="flex justify-end pt-4 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border transition"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 rounded-md font-semibold transition"
              style={{
                backgroundColor: "var(--color-primary)",
                color: "#fff",
              }}
            >
              {loading ? "Creando..." : "Crear Usuario"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
};

// ==========================================================
// 🧩 Subcomponente Field reutilizable
// ==========================================================
const Field = ({ label, children }) => (
  <div className="space-y-1">
    <label className="block text-sm" style={{ color: "var(--color-text)" }}>
      {label}
    </label>
    {children}
  </div>
);

export default UserFormModal;

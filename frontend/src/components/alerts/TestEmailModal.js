import React, { useState } from "react";
import { FiSend, FiX, FiMail } from "react-icons/fi";
import Portal from "../Portal";

const BASE = `http://${window.location.hostname}:5000`;

export default function TestEmailModal({ isOpen, onClose, smtpProfile, token }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Prueba de alerta");
  const [message, setMessage] = useState("Este es un mensaje de prueba.");
  const [isHtml, setIsHtml] = useState(false);
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    setStatus(null);

    try {
      const res = await fetch(`${BASE}/alerts/email_profiles/${smtpProfile?.id}/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to,
          subject,
          message,
          is_html: isHtml,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus({ ok: true, msg: "📤 Correo enviado exitosamente." });
      } else {
        setStatus({ ok: false, msg: data.error || "❌ Error desconocido" });
      }
    } catch (err) {
      setStatus({ ok: false, msg: `❌ ${err.message}` });
    }

    setSending(false);
  };

  if (!isOpen) return null;

  return (
    <Portal>
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
      <div
        className="w-full max-w-xl rounded-xl border shadow-2xl"
        style={{
          backgroundColor: "var(--color-card)",
          color: "var(--color-text)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Encabezado */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FiMail /> Prueba de envío SMTP
          </h2>
          <button
            onClick={onClose}
            className="text-xl hover:text-red-400"
            style={{ color: "var(--color-text)" }}
          >
            <FiX />
          </button>
        </div>

        {/* Formulario */}
        <div className="p-6 space-y-4 text-sm">
          <FormInput
            label="Enviar a"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
          <FormInput
            label="Asunto"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <FormTextarea
            label="Mensaje"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          {/* Toggle HTML */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text)] opacity-70">Formato del mensaje</span>
            <button
              type="button"
              onClick={() => setIsHtml(!isHtml)}
              className={`text-sm px-4 py-1 rounded-full border transition ${
                isHtml
                  ? "bg-green-600/20 text-green-400 border-green-500"
                  : "bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600"
              }`}
            >
              {isHtml ? "HTML Activado" : "Texto Plano"}
            </button>
          </div>

          {/* Estado */}
          {status && (
            <div
              className={`text-sm px-4 py-2 rounded border ${
                status.ok
                  ? "bg-green-800/20 text-green-300 border-green-500"
                  : "bg-red-800/20 text-red-300 border-red-500"
              }`}
            >
              {status.msg}
            </div>
          )}

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 border rounded-md transition"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !to}
              className="px-6 py-2 rounded-md font-medium flex items-center gap-2 transition"
              style={{
                backgroundColor: "var(--color-primary)",
                color: "#fff",
              }}
            >
              {sending ? "Enviando…" : <><FiSend /> Enviar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}

// Subcomponentes reutilizables
const FormInput = ({ label, ...props }) => (
  <div>
    <label className="block mb-1 text-sm" style={{ color: "var(--color-text)" }}>
      {label}
    </label>
    <input
      {...props}
      className="w-full px-4 py-2 rounded-md border text-sm"
      style={{
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
        borderColor: "var(--color-border)",
      }}
    />
  </div>
);

const FormTextarea = ({ label, ...props }) => (
  <div>
    <label className="block mb-1 text-sm" style={{ color: "var(--color-text)" }}>
      {label}
    </label>
    <textarea
      rows={4}
      {...props}
      className="w-full px-4 py-2 rounded-md border text-sm"
      style={{
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
        borderColor: "var(--color-border)",
      }}
    />
  </div>
);

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND = `http://${window.location.hostname}:5000`;

export default function ConfigBroker() {
  const [modoConexion, setModoConexion] = useState('wifi'); // 'wifi' o 'ethernet'
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [ipMode, setIpMode] = useState('dhcp'); // 'dhcp' o 'static'
  const [esp32IP, setEsp32IP] = useState('');
  const [subnet, setSubnet] = useState('');
  const [gateway, setGateway] = useState('');
  const [dns, setDns] = useState('');
  const [brokerIP, setBrokerIP] = useState('');
  const [brokerPort, setBrokerPort] = useState(1883);
  const [enviado, setEnviado] = useState(null);
  const [error, setError] = useState(null);

  // Al cargar, intenta autocompletar IP local como broker
  useEffect(() => {
    axios
      .get(`${BACKEND}/ip_local`)
      .then((res) => setBrokerIP(res.data.ip))
      .catch(() => setBrokerIP(''));
  }, []);

  const handleEnviar = async () => {
    setEnviado(null);
    setError(null);

    const payload = {
      modo: modoConexion,  // ✅ CAMPO CORRECTO
      broker_ip: brokerIP,
      broker_port: parseInt(brokerPort) || 1883,
    };

    if (modoConexion === 'wifi') {
      payload.wifi_ssid = wifiSSID;
      payload.wifi_password = wifiPassword;
    }

    if (modoConexion === 'ethernet') {
      payload.ip_mode = ipMode;
      if (ipMode === 'static') {
        payload.ip_address = esp32IP;
        payload.subnet_mask = subnet;
        payload.gateway = gateway;
        payload.dns = dns;
      }
    }

    try {
      const res = await axios.post(`${BACKEND}/configurar_esp32`, payload);
      setEnviado(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al enviar');
    }
  };

  return (
    <div
      className="max-w-xl p-6 rounded-xl shadow-lg border space-y-6 transition-all"
      style={{
        backgroundColor: 'var(--color-card)',
        color: 'var(--color-text)',
        borderColor: 'var(--color-border)',
      }}
    >
      <h2 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
        🔧 Configuración del ESP32 (Red + MQTT)
      </h2>

      <div className="space-y-6">
        <SwitchSelector
          label="Tipo de conexión"
          options={[
            { label: 'WiFi', value: 'wifi' },
            { label: 'Ethernet', value: 'ethernet' },
          ]}
          value={modoConexion}
          onChange={setModoConexion}
        />

        {modoConexion === 'wifi' && (
          <>
            <Field label="SSID WiFi" value={wifiSSID} onChange={setWifiSSID} />
            <Field label="Contraseña WiFi" value={wifiPassword} onChange={setWifiPassword} type="password" />
          </>
        )}

        {modoConexion === 'ethernet' && (
          <>
            <SwitchSelector
              label="Asignación de IP"
              options={[
                { label: 'DHCP', value: 'dhcp' },
                { label: 'IP Estática', value: 'static' },
              ]}
              value={ipMode}
              onChange={setIpMode}
            />

            {ipMode === 'static' && (
              <>
                <Field label="IP fija para ESP32" value={esp32IP} onChange={setEsp32IP} />
                <Field label="Máscara de subred" value={subnet} onChange={setSubnet} />
                <Field label="Gateway" value={gateway} onChange={setGateway} />
                <Field label="DNS (opcional)" value={dns} onChange={setDns} />
              </>
            )}
          </>
        )}

        <Field label="IP del Broker MQTT" value={brokerIP} onChange={setBrokerIP} />
        <Field label="Puerto del Broker (1883 por defecto)" value={brokerPort} onChange={setBrokerPort} />
      </div>

      <div className="flex items-center gap-4 pt-4 flex-wrap">
        <button
          onClick={handleEnviar}
          className="px-6 py-2 rounded-lg font-semibold transition-all shadow hover:scale-[1.02]"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: '#fff',
          }}
        >
          🚀 Enviar al ESP32
        </button>

        {enviado && (
          <span className="text-green-500 text-sm">✅ Configuración enviada correctamente</span>
        )}
        {error && (
          <span className="text-red-500 text-sm">❌ {error}</span>
        )}
      </div>
    </div>
  );
}

// 🧩 Campo de texto reutilizable
const Field = ({ label, value, onChange, type = 'text' }) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
      {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-4 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition"
      style={{
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-text)',
        borderColor: 'var(--color-border)',
      }}
    />
  </div>
);

// 🎚️ Selector exclusivo (tipo botón)
const SwitchSelector = ({ label, options, value, onChange }) => (
  <div className="flex flex-col gap-2">
    <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
      {label}
    </label>
    <div className="flex gap-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1 rounded-md font-semibold border transition-all ${
            value === opt.value ? 'shadow' : 'opacity-70'
          }`}
          style={{
            backgroundColor: value === opt.value ? 'var(--color-primary)' : 'transparent',
            color: value === opt.value ? '#fff' : 'var(--color-text)',
            borderColor: 'var(--color-border)',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

import React from "react";
import { FiRefreshCw } from "react-icons/fi";

const DashboardOverview = ({ cabinets, onRescanSensors }) => {
  return (
    <div className="p-6 bg-gray-900 rounded-lg shadow-xl">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-white">Vista General de Gabinetes</h2>
        <button
          onClick={onRescanSensors}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow transition duration-200"
        >
          <FiRefreshCw className="w-5 h-5" />
          Reescanear Sensores
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {cabinets.map((cabinet) => (
          <div
            key={cabinet.id}
            className="bg-gray-800 rounded-xl border border-gray-700 shadow-md p-5 flex flex-col justify-between"
          >
            <div>
              <h3 className="text-xl font-semibold text-blue-400 mb-1">{cabinet.name}</h3>
              <p className="text-sm text-gray-400 mb-2">Ubicación: {cabinet.location}</p>
              <div className="mb-3">
                <span
                  className={`inline-block px-3 py-1 text-xs rounded-full font-medium ${
                    cabinet.status === "OK"
                      ? "bg-green-500 text-white"
                      : "bg-red-500 text-white"
                  }`}
                >
                  Estado General: {cabinet.status}
                </span>
              </div>

              <h4 className="text-md font-semibold text-gray-300 mb-2">Sensores:</h4>
              <ul className="space-y-1">
                {cabinet.sensors.map((sensor) => (
                  <li
                    key={sensor.id}
                    className="flex justify-between text-sm text-gray-300"
                  >
                    <span>{sensor.name} ({sensor.type})</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        sensor.status === "OK"
                          ? "bg-green-400 text-green-900"
                          : "bg-yellow-400 text-yellow-900"
                      }`}
                    >
                      {sensor.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Placeholder de gráfico */}
            <div className="mt-6 h-24 rounded-md bg-white/5 border border-gray-600 backdrop-blur-sm flex items-center justify-center text-sm text-gray-400">
              Gráfico en tiempo real (Ej. Temperatura)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardOverview;

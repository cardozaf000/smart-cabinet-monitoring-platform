
import pandas as pd
import numpy as np
import pymysql
import joblib
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# ─────────────────────────────────────────
# CONFIGURACION - cambia si es necesario
# ─────────────────────────────────────────
DB_CONFIG = {
    "host": "192.168.0.25",
    "user": "ml_user",
    "password": "Focm1903$",   # <-- cambia esto
    "database": "monitoring_iot"
}

N_ESTIMATORS  = 100
CONTAMINATION = 0.02   # ~2% de datos anomalos asumidos en entrenamiento
RANDOM_STATE  = 42

# ─────────────────────────────────────────
# 1. EXTRAER DATOS
# ─────────────────────────────────────────
print("Conectando a MariaDB...")
conn = pymysql.connect(**DB_CONFIG)

query = """
SELECT timestamp, sensor_id, tipo_medida, valor
FROM lecturas
WHERE (sensor_id = '0x44' AND tipo_medida IN ('temperatura', 'humedad'))
   OR (sensor_id = '0x23' AND tipo_medida = 'luz')
   OR (sensor_id = '0x29' AND tipo_medida = 'distancia')
   OR (sensor_id = '0x68' AND tipo_medida = 'estado')
   OR (sensor_id = 'mq2'  AND tipo_medida = 'humo')
   OR (sensor_id = 'pir'  AND tipo_medida = 'movimiento')
   OR (sensor_id = 'reed' AND tipo_medida = 'estado')
ORDER BY timestamp
"""

print("Cargando datos (puede tardar unos segundos)...")
df_raw = pd.read_sql(query, conn)
conn.close()

print(f"Registros cargados: {len(df_raw):,}")

# ─────────────────────────────────────────
# 2. PIVOTAR - una columna por sensor
# ─────────────────────────────────────────
df_raw["feature"]    = df_raw["sensor_id"] + "_" + df_raw["tipo_medida"]
df_raw["timestamp"]  = pd.to_datetime(df_raw["timestamp"])
df_raw["ts_round"]   = df_raw["timestamp"].dt.round("10s")

df = df_raw.pivot_table(
    index="ts_round",
    columns="feature",
    values="valor",
    aggfunc="mean"
).reset_index()

df.columns.name = None
df = df.rename(columns={
    "ts_round":         "timestamp",
    "0x44_temperatura": "temperatura",
    "0x44_humedad":     "humedad",
    "0x23_luz":         "luz",
    "0x29_distancia":   "distancia",
    "0x68_estado":      "mpu6050",
    "mq2_humo":         "humo",
    "pir_movimiento":   "movimiento",
    "reed_estado":      "reed"
})

print(f"Registros despues de pivotar: {len(df):,}")
print("\nValores nulos por columna:")
print(df.isnull().sum())

df = df.dropna(thresh=6)
df = df.fillna(df.median(numeric_only=True))
print(f"Registros limpios: {len(df):,}")

# ─────────────────────────────────────────
# 3. FEATURES DERIVADAS
# ─────────────────────────────────────────
df = df.sort_values("timestamp").reset_index(drop=True)

df["temp_rate"] = df["temperatura"].diff().fillna(0)

df["hora"]     = df["timestamp"].dt.hour + df["timestamp"].dt.minute / 60
df["hora_sin"] = np.sin(2 * np.pi * df["hora"] / 24)
df["hora_cos"] = np.cos(2 * np.pi * df["hora"] / 24)

FEATURES = [
    "temperatura", "humedad", "luz", "distancia",
    "humo", "movimiento", "reed", "mpu6050",
    "temp_rate", "hora_sin", "hora_cos"
]

X = df[FEATURES].copy()
print(f"\nShape del dataset de entrenamiento: {X.shape}")

# ─────────────────────────────────────────
# 4. ANALISIS EXPLORATORIO
# ─────────────────────────────────────────
print("\nGenerando graficas...")

fig, axes = plt.subplots(3, 3, figsize=(15, 10))
fig.suptitle("Distribucion de Features - Datos de Entrenamiento", fontsize=14)

features_plot = ["temperatura", "humedad", "luz", "distancia", "humo", "temp_rate"]
for i, feat in enumerate(features_plot):
    ax = axes[i // 3][i % 3]
    ax.hist(df[feat], bins=50, color="steelblue", edgecolor="white", alpha=0.8)
    ax.set_title(feat)
    ax.set_xlabel("Valor")
    ax.set_ylabel("Frecuencia")

ax_corr = axes[2][1]
corr = df[["temperatura", "humedad", "luz", "distancia", "humo"]].corr()
sns.heatmap(corr, ax=ax_corr, annot=True, fmt=".2f", cmap="coolwarm", center=0)
ax_corr.set_title("Correlacion entre features")

ax_ts = axes[2][2]
df_sample = df.iloc[::100]
ax_ts.plot(df_sample["timestamp"], df_sample["temperatura"], color="tomato", linewidth=0.8)
ax_ts.set_title("Serie temporal - Temperatura")
ax_ts.set_xlabel("Tiempo")
ax_ts.set_ylabel("grados C")
ax_ts.tick_params(axis="x", rotation=45)

plt.tight_layout()
plt.savefig("analisis_exploratorio.png", dpi=120, bbox_inches="tight")
plt.show()
print("Guardada: analisis_exploratorio.png")

# ─────────────────────────────────────────
# 5. ENTRENAR ISOLATION FOREST
# ─────────────────────────────────────────
print("\nNormalizando features...")
scaler   = StandardScaler()
X_scaled = scaler.fit_transform(X)

print(f"Entrenando Isolation Forest...")
modelo = IsolationForest(
    n_estimators=N_ESTIMATORS,
    contamination=CONTAMINATION,
    random_state=RANDOM_STATE,
    n_jobs=-1
)
modelo.fit(X_scaled)

df["score"]    = modelo.decision_function(X_scaled)
df["anomalia"] = modelo.predict(X_scaled)   # -1 = anomalia, 1 = normal

n_anomalias = (df["anomalia"] == -1).sum()
print(f"Anomalias detectadas: {n_anomalias} ({n_anomalias/len(df)*100:.1f}%)")

# Grafica de scores en el tiempo
plt.figure(figsize=(14, 4))
plt.plot(df["timestamp"].iloc[::50], df["score"].iloc[::50],
         color="steelblue", linewidth=0.7, label="Score")
plt.axhline(y=0, color="tomato", linestyle="--", linewidth=1, label="Umbral (0)")
anom = df[df["anomalia"] == -1].iloc[::10]
plt.scatter(anom["timestamp"], anom["score"], color="tomato", s=5, zorder=5, label="Anomalia")
plt.title("Scores del Isolation Forest")
plt.xlabel("Tiempo")
plt.ylabel("Decision score")
plt.legend()
plt.tight_layout()
plt.savefig("scores_isolation_forest.png", dpi=120, bbox_inches="tight")
plt.show()
print("Guardada: scores_isolation_forest.png")

# ─────────────────────────────────────────
# 6. GUARDAR MODELO
# ─────────────────────────────────────────
joblib.dump(modelo,   "modelo_if.pkl")
joblib.dump(scaler,   "scaler.pkl")
joblib.dump(FEATURES, "features.pkl")

print("\n=== ENTRENAMIENTO COMPLETO ===")
print("Archivos generados:")
print("  modelo_if.pkl  - modelo Isolation Forest")
print("  scaler.pkl     - normalizador")
print("  features.pkl   - lista de features")
print("\nSiguiente paso: copiar a la Raspberry Pi")
print("  scp modelo_if.pkl scaler.pkl features.pkl pi@192.168.0.25:/home/pi/ml_monitoreo/")

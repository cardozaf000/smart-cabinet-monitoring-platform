# backend/app/db_config.py
import mysql.connector
from mysql.connector import Error

def get_db_connection():
    try:
        conn = mysql.connector.connect(
            host="localhost",
            user="iotuser",
            password="iotpass123",
            database="monitoring_iot",
            connection_timeout=5
        )
        return conn
    except Error as err:
        print(f"[ERROR][DB] No se pudo conectar a la base de datos: {err}")
        raise

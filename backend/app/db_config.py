# backend/app/db_config.py
import mysql.connector
from mysql.connector import Error
from mysql.connector.pooling import MySQLConnectionPool

_pool = None


def _get_pool() -> MySQLConnectionPool:
    global _pool
    if _pool is None:
        _pool = MySQLConnectionPool(
            pool_name="iotpool",
            pool_size=10,
            host="localhost",
            user="iotuser",
            password="iotpass123",
            database="monitoring_iot",
            connection_timeout=5,
        )
    return _pool


def get_db_connection():
    try:
        return _get_pool().get_connection()
    except Error as err:
        print(f"[ERROR][DB] No se pudo obtener conexión del pool: {err}")
        raise

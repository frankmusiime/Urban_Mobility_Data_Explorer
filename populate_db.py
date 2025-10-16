
"""
Insert all rows from clean_data.csv into MySQL.
"""

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
import os

# === MySQL Connection Details ===
DB_USER = "taxi_user"
DB_PASS = "Str0ng!Pass123"
DB_HOST = "localhost"
DB_PORT = "3306"
DB_NAME = "taxi_data"
CSV_FILE = "Urban_Mobility_Data_Explorer/clean_data.csv"

# === SQLAlchemy Engine ===
engine_url = (
    f"mysql+mysqlconnector://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
engine = create_engine(engine_url)


def reset_table():
    """Drop the 'trips' table if it exists."""
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS trips;"))
    print("Dropped existing table 'trips'.")


def create_table_if_not_exists():
    """Create the 'trips' table if it does not exist."""
    create_sql = """
    CREATE TABLE IF NOT EXISTS trips (
        id VARCHAR(50) PRIMARY KEY,
        vendor_id VARCHAR(10),
        pickup_datetime DATETIME,
        dropoff_datetime DATETIME,
        passenger_count INT,
        pickup_longitude FLOAT,
        pickup_latitude FLOAT,
        dropoff_longitude FLOAT,
        dropoff_latitude FLOAT,
        store_and_fwd_flag VARCHAR(3),
        trip_duration FLOAT,
        trip_duration_min FLOAT,
        trip_distance_km FLOAT,
        speed_kmh FLOAT
    );
    """
    with engine.connect() as conn:
        conn.execute(text(create_sql))
    print("Table 'trips' is ready.")


def insert_all_rows():
    """Insert all rows from clean_data.csv into MySQL."""
    if not os.path.exists(CSV_FILE):
        print(f"File not found: {CSV_FILE}")
        return

    try:
        # Read the entire CSV (no row limit)
        df = pd.read_csv(CSV_FILE)
        df.columns = [c.strip().lower() for c in df.columns]

        # Drop duplicate columns if any
        df = df.loc[:, ~df.columns.duplicated()]

        # Convert date/time columns
        df["pickup_datetime"] = pd.to_datetime(
            df["pickup_datetime"], errors="coerce")
        df["dropoff_datetime"] = pd.to_datetime(
            df["dropoff_datetime"], errors="coerce")

        # Drop rows with invalid datetimes
        df = df.dropna(subset=["pickup_datetime", "dropoff_datetime"])

        # Insert all data in chunks (safe for large files)
        chunksize = 5000
        total_inserted = 0

        for start in range(0, len(df), chunksize):
            chunk = df.iloc[start:start + chunksize]
            chunk.to_sql("trips", con=engine, if_exists="append",
                         index=False, method="multi")
            total_inserted += len(chunk)
            print(f"Inserted {total_inserted}/{len(df)} rows...")

        print(f"\n {total_inserted}total rows inserted into 'trips' table.")

    except SQLAlchemyError as e:
        print(f"Insert failed: {e}")


if __name__ == "__main__":
    reset_table()
    create_table_if_not_exists()
    insert_all_rows()

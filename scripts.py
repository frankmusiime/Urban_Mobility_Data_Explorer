from flask import Flask, jsonify
import pandas as pd
import numpy as np

app = Flask(__name__)

# --- File Paths ---
RAW_FILE = r"C:\Users\FRANK_PC\Documents\work\train.csv"
CLEAN_FILE = "clean_data.csv"
LOG_FILE = "excluded_data_log.csv"


@app.route("/clean_data", methods=["GET"])
def clean_data():
    try:
        # --- Load dataset ---
        df = pd.read_csv(RAW_FILE, low_memory=False)
        print(f"Loaded {len(df)} rows from {RAW_FILE}")

        # Create an empty DataFrame to collect messy data
        excluded = pd.DataFrame()

        # --- Handle missing values ---
        missing_mask = df.isnull().any(axis=1)
        excluded = pd.concat([excluded, df[missing_mask]])
        df = df.dropna()

        # --- Remove duplicates ---
        duplicate_mask = df.duplicated()
        excluded = pd.concat([excluded, df[duplicate_mask]])
        df = df.drop_duplicates()

        # --- Convert timestamps ---
        df["pickup_datetime"] = pd.to_datetime(
            df["pickup_datetime"], errors="coerce"
        )
        df["dropoff_datetime"] = pd.to_datetime(
            df["dropoff_datetime"], errors="coerce"
        )

        # --- Remove invalid time entries (dropoff before pickup) ---
        invalid_time_mask = df["dropoff_datetime"] < df["pickup_datetime"]
        excluded = pd.concat([excluded, df[invalid_time_mask]])
        df = df[~invalid_time_mask]

        # --- Derived Feature 1: Trip duration in minutes ---
        df["trip_duration_min"] = df["trip_duration"] / 60

        # --- Derived Feature 2: Trip distance using Haversine formula ---
        def haversine(lat1, lon1, lat2, lon2):
            """Compute great-circle distance (km) between two
            coordinate points."""
            R = 6371  # Earth radius in km
            lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = (np.sin(dlat / 2) ** 2 +
                 np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2)
            c = 2 * np.arcsin(np.sqrt(a))
            return R * c

        df["trip_distance_km"] = haversine(
            df["pickup_latitude"],
            df["pickup_longitude"],
            df["dropoff_latitude"],
            df["dropoff_longitude"],
        )

        # --- Derived Feature 3: Average trip speed (km/h) ---
        df["speed_kmh"] = df["trip_distance_km"] / (
            df["trip_duration_min"] / 60
        )

        # --- Remove outliers (unrealistic data) ---
        invalid_mask = (
            (df["trip_distance_km"] <= 0)
            | (df["trip_distance_km"] > 100)
            | (df["speed_kmh"] <= 0)
            | (df["speed_kmh"] > 200)
        )
        excluded = pd.concat([excluded, df[invalid_mask]])
        df = df[~invalid_mask]

        # --- Replace infinite or NaN values ---
        df = df.replace([np.inf, -np.inf], np.nan).fillna(0)
        # Strip suffixes like _m4998

        # --- Save outputs ---
        df.to_csv(CLEAN_FILE, index=False)
        excluded.to_csv(LOG_FILE, index=False)

        return jsonify({
            "status": "success",
            "rows_cleaned": len(df),
            "rows_excluded": len(excluded),
            "clean_file": CLEAN_FILE,
            "log_file": LOG_FILE,
            "derived_features": [
                "trip_duration_min",
                "trip_distance_km",
                "speed_kmh"
            ]
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


if __name__ == "__main__":
    app.run(debug=True)
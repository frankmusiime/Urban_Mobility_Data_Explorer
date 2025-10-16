# Urban Mobility Data Explorer 🚦

## Table of Contents
1. [Project Overview](#project-overview)
2. [Installation](#installation)
3. [Data Cleaning](#data-cleaning)
4. [Database Schema](#database-schema)
5. [Backend API](#backend-api)
6. [Frontend Dashboard](#frontend-dashboard)
7. [Manual Algorithm](#manual-algorithm)
8. [Insights](#insights)
9. [Testing & Runtime](#testing--runtime)
10. [Video Walkthrough](#video-walkthrough)


## Project Overview

The **Urban Mobility Data Explorer** is designed to process and analyze NYC taxi trip data. This project includes:

- **Data Cleaning Pipeline**: Reads raw CSV data, cleans it, and generates `clean_data.csv` along with a log of excluded rows.
- **Database Schema**: A relational database schema and scripts to insert cleaned data into the database with integrity and chunking for large files.
- **Backend API**: An efficient API that queries the database, supporting pagination, column selection, and filters.
- **Frontend Dashboard**: A simple HTML/JS interface that consumes the API and visualizes results.
- **Manual Algorithm**: An implemented algorithm without helper libraries, including pseudo-code and complexity analysis.
- **Insights Report**: A report covering dataset issues, architecture, algorithm explanation, insights, and reflections.
- **Video Walkthrough**: A short video (5 minutes) demonstrating the working system.

## Installation

### Prerequisites
Ensure you have the following installed on your machine:
- **Python 3.7 or higher**
- **pip** (Python package installer)
- **Node.js** (for frontend development, if applicable)
- A code editor (like VSCode, PyCharm, etc.)

### Steps
1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/urban-mobility-data-explorer.git
   cd urban-mobility-data-explorer
Set up a virtual environment (recommended):

Copy
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
Install backend dependencies:

Copy
pip install -r requirements.txt
Install frontend dependencies (if applicable):
If you are using a frontend framework (like React, Vue, etc.), navigate to the frontend directory and install dependencies:

Copy
cd frontend
npm install
Data Cleaning
Overview
The clean_data.py script performs the following tasks:

Reads train.csv.
Drops and records invalid rows.
Derives features such as trip_duration_min, trip_distance_km, and speed_kmh.
Writes clean_data.csv and excluded_data_log.csv.
Key Points
Processes large CSVs using chunksize to avoid memory overload.
Saves excluded rows (missing or invalid) to `excluded_data_log.csv.
Example Code
Copy
import pandas as pd
import numpy as np
import os

RAW_FILE = r"train.csv"
CLEAN_FILE = "clean_data.csv"
LOG_FILE = "excluded_data_log.csv"
CHUNKSIZE = 200000

def haversine(lat1, lon1, lat2, lon2):
    R = 6371  # Earth radius in kilometers
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = (np.sin(dlat/2)**2 + np.cos(lat1)*np.cos(lat2)*np.sin(dlon/2)**2)
    c = 2 * np.arcsin(np.sqrt(a))
    return R * c

first_write = True
for chunk in pd.read_csv(RAW_FILE, chunksize=CHUNKSIZE, low_memory=False):
    chunk = chunk.dropna(subset=["pickup_datetime","dropoff_datetime",
                                 "pickup_latitude","pickup_longitude",
                                 "dropoff_latitude","dropoff_longitude","trip_duration"])
    chunk["pickup_datetime"] = pd.to_datetime(chunk["pickup_datetime"], errors="coerce")
    chunk["dropoff_datetime"] = pd.to_datetime(chunk["dropoff_datetime"], errors="coerce")
    chunk = chunk.dropna(subset=["pickup_datetime","dropoff_datetime"])
    
    # Derived features
    chunk["trip_duration_min"] = chunk["trip_duration"] / 60.0
    chunk["trip_distance_km"] = haversine(chunk["pickup_latitude"], chunk["pickup_longitude"],
                                          chunk["dropoff_latitude"], chunk["dropoff_longitude"])
    chunk["speed_kmh"] = chunk["trip_distance_km"] / (chunk["trip_duration_min"] / 60.0)
    
    # Exclude unrealistic rows
    invalid = chunk[(chunk["trip_distance_km"] <= 0) | (chunk["speed_kmh"] <= 0) | (chunk["speed_kmh"] > 200)]
    invalid.to_csv(LOG_FILE, mode="a", index=False, header=first_write)
    first_write = False
    chunk = chunk[~((chunk["trip_distance_km"] <= 0) | (chunk["speed_kmh"] <= 0) | (chunk["speed_kmh"] > 200))]
    chunk.to_csv(CLEAN_FILE, mode="a", index=False, header=not os.path.exists(CLEAN_FILE))
 # Database Schema  #
Overview
Create a normalized, indexed schema for the trips table.

Recommended Schema (MySQL)
Copy
CREATE TABLE IF NOT EXISTS trips (
    id VARCHAR(50) PRIMARY KEY,
    vendor_id SMALLINT,
    pickup_datetime DATETIME,
    dropoff_datetime DATETIME,
    passenger_count TINYINT,
    pickup_longitude DOUBLE,
    pickup_latitude DOUBLE,
    dropoff_longitude DOUBLE,
    dropoff_latitude DOUBLE,
    store_and_fwd_flag VARCHAR(3),
    trip_duration FLOAT,
    trip_duration_min FLOAT,
    trip_distance_km FLOAT,
    speed_kmh FLOAT,
    INDEX idx_pickup_dt (pickup_datetime),
    INDEX idx_pickup_zone (pickup_latitude, pickup_longitude),
    INDEX idx_speed (speed_kmh)
);
Notes
Use VARCHAR for IDs if original IDs are strings.
Index pickup_datetime for time-based queries.
Index latitude/longitude pairs for zone-level queries.
 # Backend API
Overview
The backend API provides endpoints to interact with the database.

Example API Snippet
Copy
from flask import Flask, jsonify, request
from sqlalchemy import create_engine, text
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
engine = create_engine("mysql+mysqlconnector://taxi_user:Str0ng!Pass123@localhost:3306/taxi_data")

@app.route("/api/trips", methods=["GET"])
def get_trips():
    limit = min(int(request.args.get("limit", 100)), 1000)
    offset = int(request.args.get("offset", 0))
    cols = request.args.get("cols", "*")
    
    # Sanitize columns 
    allowed = set(["id", "vendor_id", "pickup_datetime", "dropoff_datetime", 
                   "passenger_count", "pickup_longitude", "pickup_latitude", 
                   "dropoff_longitude", "dropoff_latitude", "store_and_fwd_flag", 
                   "trip_duration", "trip_duration_min", "trip_distance_km", "speed_kmh"])
    if cols != "*":
        requested = [c.strip() for c in cols.split(",")]
        if not all(c in allowed for c in requested):
            return jsonify({"error": "invalid columns requested"}), 400
        col_clause = ",".join(requested)
    else:
        col_clause = "*"

    sql = text(f"SELECT {col_clause} FROM trips LIMIT :limit OFFSET :offset")
    with engine.connect() as conn:
        rows = conn.execute(sql, {"limit": limit, "offset": offset})
        result = [dict(r._mapping) for r in rows]
    return jsonify(result)

if __name__ == "__main__":
    app.run(debug=True)
Performance Tips
Implement pagination to return limited rows.
Avoid returning the entire database in one request.
 # Frontend Dashboard #
Overview
The frontend dashboard provides a user interface for data visualization.
# Technologies Used
**HTML:** For structuring the webpage.
**CSS:** For styling the dashboard.
**JavaScript:** For dynamic content and API calls.
**Chart.js:** For visualizing data in charts.
Features
Displays a table of trips with relevant data.
Interactive charts showing average trip duration and speed.
Filters to select specific data views.


  # Key Endpoints  #
GET /api/trips — Supports limit, offset, column selection, and filters.
GET /api/fastest_zones — Returns top zones by average speed.
Example Fetch in Frontend JS
Copy
fetch("http://127.0.0.1:5000/api/trips?limit=100")
  .then(response => response.json())
  .then(data => {
    // Populate table or charts
    console.log(data);
  });
 # Manual Algorithm  #
 Overview 
Implement a manual algorithm to determine the fastest pickup zones based on average speed.

 # Example Complexity Analysis # 
Time Complexity: O(n) to read n rows + O(z) to scan zones for best average (z ≤ n). So, overall O(n).
Space Complexity: O(z) for maps (worst-case O(n)).
 # Insights  #
Insight	Method	Interpretation
Fastest Pickup Zones	Algorithm / SQL	Highways or low-traffic areas
Peak Congestion Hours	AVG(trip_duration_min) by hour	Identify rush hours
Speed vs Distance	AVG(speed_kmh) by distance bin	Detect anomalies or route efficiency
 # Testing & Runtime #
 Overview 
Test the performance and functionality of the application.

Use time.time() or time.perf_counter() in your algorithm script to report elapsed time.
Print counts per chunk and total inserted rows for insertion scripts.
Test API endpoints using Postman or curl:
Copy
curl "http://127.0.0.1:5000/api/trips?limit=100"
 # Video Walkthrough  
A short video demonstrating the working system will be provided here.

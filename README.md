# Urban_Mobility_Data_Explorer1) Problem framing → what to produce 
You must deliver (and demonstrate you understand each item):
A data cleaning pipeline that reads the raw CSV and writes clean_data.csv plus a log of excluded rows.


A relational DB schema and script(s) that insert the cleaned data into the DB with integrity (and chunking for large files).


A backend API that queries the DB efficiently (pagination, column selection, filters).


A frontend/dashboard (simple HTML/JS is fine) that consumes the API and visualizes results.


A manual algorithm (no helper libs) that you implemented and explained — includes pseudo-code and complexity analysis.


A report (2–3 pages) covering dataset issues, architecture, algorithm explanation, insights, and reflection.


A short video walkthrough (5 minutes) demonstrating the working system.



2) Data cleaning pipeline (what to deliver + minimal safe code)
Deliverables:
scripts.py or clean_data.py that:


reads train.csv,


drops/records invalid rows,


derives at least 3 features (e.g. trip_duration_min, trip_distance_km, speed_kmh),


writes clean_data.csv and excluded_data_log.csv.


Key points:
Use chunksize to process very large CSVs without blowing memory OR load once if your machine handles it.


Save excluded rows (missing or invalid) to excluded_data_log.csv.


Minimal (example) cleaning pattern — you already have this in scripts.py. To be explicit, include chunked reading option:
# core snippet to put in scripts.py (chunked)
import pandas as pd
import numpy as np

RAW_FILE = r"train.csv"
CLEAN_FILE = "clean_data.csv"
LOG_FILE = "excluded_data_log.csv"
CHUNKSIZE = 200000

def haversine(lat1, lon1, lat2, lon2):
    # vectorized use of numpy allowed here
    R = 6371
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = (np.sin(dlat/2)**2 + np.cos(lat1)*np.cos(lat2)*np.sin(dlon/2)**2)
    c = 2*np.arcsin(np.sqrt(a))
    return R*c

first_write = True
for chunk in pd.read_csv(RAW_FILE, chunksize=CHUNKSIZE, low_memory=False):
    # basic cleaning:
    chunk = chunk.dropna(subset=["pickup_datetime","dropoff_datetime",
                                 "pickup_latitude","pickup_longitude",
                                 "dropoff_latitude","dropoff_longitude","trip_duration"])
    chunk["pickup_datetime"] = pd.to_datetime(chunk["pickup_datetime"], errors="coerce")
    chunk["dropoff_datetime"] = pd.to_datetime(chunk["dropoff_datetime"], errors="coerce")
    chunk = chunk.dropna(subset=["pickup_datetime","dropoff_datetime"])
    # derived:
    chunk["trip_duration_min"] = chunk["trip_duration"]/60.0
    chunk["trip_distance_km"] = haversine(chunk["pickup_latitude"], chunk["pickup_longitude"],
                                          chunk["dropoff_latitude"], chunk["dropoff_longitude"])
    chunk["speed_kmh"] = chunk["trip_distance_km"] / (chunk["trip_duration_min"]/60.0)
    # exclude unrealistic rows:
    invalid = chunk[(chunk["trip_distance_km"]<=0) | (chunk["speed_kmh"]<=0) | (chunk["speed_kmh"]>200)]
    invalid.to_csv(LOG_FILE, mode="a", index=False, header=first_write)
    first_write = False if first_write else False
    chunk = chunk[~((chunk["trip_distance_km"]<=0) | (chunk["speed_kmh"]<=0) | (chunk["speed_kmh"]>200))]
    chunk.to_csv(CLEAN_FILE, mode="a", index=False, header=not os.path.exists(CLEAN_FILE))

Document in report: assumptions you made, outlier thresholds, and why you logged excluded rows.

3) Database design & schema (deliverable + implementation)
Goal: normalized, indexed schema. Keep trips as main table (denormalized enough for one-file project), index commonly queried columns.
Recommended schema (MySQL):
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

Notes:
Use VARCHAR id if original ids are strings.


Index pickup_datetime for time-based queries.


Index lat/lon pair for zone level queries (speed/heatmap).


If you split into normalized tables (vendors, zones) justify why; for the assignment a single trips table with indexes is acceptable.



4) Insert cleaned data into MySQL safely (chunked, robust)
Use pd.read_csv(..., chunksize=...) and to_sql(..., if_exists='append', method='multi') per chunk to avoid memory issues.
Example populate_db.py (streaming):
import pandas as pd
from sqlalchemy import create_engine, text
import os

engine = create_engine("mysql+mysqlconnector://taxi_user:Str0ng!Pass123@localhost:3306/taxi_data")

def create_table_if_not_exists():
    create_sql = """..."""  # same SQL as above
    with engine.begin() as conn:
        conn.execute(text(create_sql))

def insert_all_rows_streamed(csv_path, chunksize=5000):
    for chunk in pd.read_csv(csv_path, chunksize=chunksize, parse_dates=["pickup_datetime","dropoff_datetime"]):
        chunk.columns = [c.strip().lower() for c in chunk.columns]
        # drop duplicates columns:
        chunk = chunk.loc[:, ~chunk.columns.duplicated()]
        chunk = chunk.dropna(subset=["pickup_datetime","dropoff_datetime"])
        chunk.to_sql("trips", con=engine, if_exists="append", index=False, method="multi")

if __name__ == "__main__":
    create_table_if_not_exists()
    insert_all_rows_streamed("clean_data.csv", chunksize=5000)

Troubleshooting:
If you can't connect to MySQL server, ensure MySQL service is running.


If Access denied, re-check DB user and GRANT privileges.



5) Backend API (Flask, with pagination and filters) deliverable
Key endpoints:
GET /api/trips — limit, offset, cols, where filters.


GET /api/fastest_zones — returns top zones by avg speed (you can run aggregation SQL or your algorithm).


Example Flask API snippet with pagination and safe params:
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
    # sanitize cols - allow only alphanumeric + underscore + comma
    if cols != "*":
        # simple whitelist - you should check against table columns
        allowed = set(["id","vendor_id","pickup_datetime","dropoff_datetime","passenger_count",
                       "pickup_longitude","pickup_latitude","dropoff_longitude","dropoff_latitude",
                       "store_and_fwd_flag","trip_duration","trip_duration_min","trip_distance_km","speed_kmh"])
        requested = [c.strip() for c in cols.split(",")]
        if not all(c in allowed for c in requested):
            return jsonify({"error":"invalid columns requested"}), 400
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

Performance tips:
Return limited rows (pagination).


Avoid returning the whole DB in one request.


For heavy analytics, implement endpoints that return aggregated results only.



6) Frontend dashboard (deliverable)
Minimum:
A single HTML file with JS that calls GET /api/trips?limit=100&offset=0 and renders a table and a few charts (Chart.js or simple SVG).


Visualizations suggestions: heatmap (pickup zones), time-of-day line chart (avg trip_duration), bar chart of top pickup zones by average speed.


Example fetch in frontend JS:
fetch("http://127.0.0.1:5000/api/trips?limit=100")
  .then(r => r.json())
  .then(data => {
    // populate table or charts
    console.log(data);
  });


7) Algorithmic logic & data structure (manual implementation requirement)
You already chose: fastest pickup zone (grid bucket average speed) — O(n). Now expand to satisfy assignment:
Deliver:
The code (no use of Counter, heapq, sort_values for ranking).


A short explanation, pseudo-code, time & space complexity.


Optionally, also implement top-k zones without using heapq — you can maintain a top-K array of size k (k small) updated per zone. That's still O(z) after accumulation; you can even compute top-K while iterating zones.


Pseudo-code (detailed):
function fastest_pickup_area(csv):
    zone_sum = {}   # map zone -> sum_speed
    zone_count = {} # map zone -> count_trips
    for each row in csv:
        lat = parse float(row.pickup_latitude), lon = parse float(row.pickup_longitude)
        speed = parse float(row.speed_kmh)
        if parse ok:
            zone = format_zone(lat, lon) # e.g., f"{int(lat*100)}_{int(lon*100)}"
            if zone not in zone_sum:
                zone_sum[zone] = 0.0
                zone_count[zone] = 0
            zone_sum[zone] += speed
            zone_count[zone] += 1
    best_zone = None
    best_avg = -inf
    for zone in zone_sum:
        avg = zone_sum[zone] / zone_count[zone]
        if avg > best_avg:
            best_avg = avg
            best_zone = zone
    return best_zone, best_avg

Complexity:
Time: O(n) to read n rows + O(z) to scan zones for best average (z ≤ n). So O(n).


Space: O(z) for maps (worst-case O(n)).


Timing the algorithm (what you requested earlier):
 Add:
import time
start = time.time()
best_zone, best_avg = fastest_pickup_area("clean_data.csv")
end = time.time()
print(f"Elapsed: {end-start:.2f} sec")

Include the elapsed time in the report.
If you want to produce more than one insight from algorithm:
Return top 10 zones (do it without heapq by scanning all zones and keeping a fixed-size sorted list — manual insertion into 1..k list is O(k) per candidate, total O(z*k), with k small like 10).



8) Insights and queries you must show (deliverable: 3 meaningful insights)
For each insight: SQL / algorithm you ran, a small chart screenshot, and interpretation.
I recommend (and you already compute) these three:
Fastest pickup zones


How derived: algorithm (grid bucket avg speed) OR SQL:

 SELECT ROUND(pickup_latitude,2) lat_r, ROUND(pickup_longitude,2) lon_r,
       AVG(speed_kmh) avg_speed, COUNT(*) trips
FROM trips
GROUP BY lat_r, lon_r
ORDER BY avg_speed DESC
LIMIT 10;


Interpretation: zones likely to be highways or low-traffic corridors — useful for routing or surge-pricing.


Peak hours with longest durations (congestion windows)


SQL:

 SELECT HOUR(pickup_datetime) hour, AVG(trip_duration_min) avg_min, COUNT(*) trips
FROM trips
GROUP BY hour
ORDER BY avg_min DESC;


Interpretation: shows times when trips are slowest  planning for drivers/dispatch.


Average speed vs distance (anomaly detection)


SQL:

 SELECT CASE WHEN trip_distance_km < 1 THEN 'short' WHEN trip_distance_km<5 THEN 'med' ELSE 'long' END dist_group,
       AVG(speed_kmh) avg_speed, COUNT(*) trips
FROM trips
GROUP BY dist_group;


Interpretation: if short trips have extremely low avg speed -> potential pick-up/dropoff congestion; if long trips have extremely high speed -> highway routes.


For each insight, include a chart (e.g., bar chart for top zones, line chart for hours) and a one-paragraph interpretation in your 2–3 page report.

9) Testing and measuring runtime
Use time.time() or time.perf_counter() in your algorithm script to report elapsed time — put the number in the report.


For insertion scripts, print counts per chunk and total inserted rows.


For API, test using Postman or curl:

 curl "http://127.0.0.1:5000/api/trips?limit=100"


If the terminal shows 200 but browser loads long with no JSON:
Likely the endpoint is trying to return too many rows or the DB query is stuck.


Use limit param and test ?limit=10.


Add logging in the endpoint around DB query and timing.



10) GitHub / large files (what you must do)
Your repo included large CSVs and push failed. Fix options:
Option A — remove large files from Git and use .gitignore (recommended for assignment)
# remove files from git history if they were committed:
git rm --cached clean_data.csv failed_rows.csv train.csv
echo "clean_data.csv" >> .gitignore
echo "failed_rows.csv" >> .gitignore
echo "train.csv" >> .gitignore
git commit -m "Remove large data files, add to gitignore"
git push

Option B — use Git LFS (if you must keep them)
git lfs install
git lfs track "*.csv"
git add .gitattributes
git add clean_data.csv
git commit -m "track csv via lfs"
git push origin main

In README explain that to run the project the grader must download raw train.csv, run cleaning script, and then run populate script — do not rely on repo containing huge CSV.

11) Documentation & video (what to include)
2–3 page report should have:
Problem framing & dataset issues (missing values, timestamp formatting, coordinate validity)


System architecture diagram (one paragraph each for frontend/backend/db)


Algorithmic logic: include code snippet, pseudo-code and time/space analyses; show timing results


Insights (3) with SQL or algorithm reproduction and visualizations (screenshots)


Reflection & future work


Video (5 minutes):
0:00–0:30 Overview of project (stack + goal)


0:30–1:30 Demo cleaning script → show clean_data.csv created and excluded file


1:30–2:30 Demo DB insert (show chunk logging) and confirm rows in DB (via SQL)


2:30–3:30 Demo API: call GET /api/trips?limit=10 and show JSON


3:30–4:30 Demo algorithm: run algorithm.py, show result and elapsed time + interpretation


4:30–5:00 Closing: talk about future improvements & academic integrity statement



12) What to write in your README (short checklist for graders)
Installation steps (venv, pip install)


MySQL setup commands (CREATE DATABASE, CREATE USER, GRANT)


How to generate clean_data.csv (python scripts.py or run endpoint)


How to populate DB (python populate_db.py)


How to start API (python api.py)


How to run algorithm script and measure time


Note about large files / Git LFS or instruct graders to run cleaning locally


Link to video



13) Troubleshooting common errors you’ve hit (and fixes)
Access denied for user 'taxi_user'@'localhost': use MySQL root to GRANT privileges, re-run FLUSH PRIVILEGES.

 CREATE USER 'taxi_user'@'localhost' IDENTIFIED BY 'Str0ng!Pass123';
GRANT ALL PRIVILEGES ON taxi_data.* TO 'taxi_user'@'localhost';
FLUSH PRIVILEGES;


Can't connect to MySQL server on 'localhost:3306': ensure MySQL service is running. On Windows:


Services -> MySQL -> Start, or net start MySQL (service name may differ).


Push to GitHub failed because files >100MB: remove large files from git history or use Git LFS (see section 10).



14) Minimal next actions I can do for you right now
Pick one (I’ll produce exact file content / commands / code):
Generate the README.md file ready to copy/paste (full text).


Produce the Flask API file with pagination + column selection + timing logging (complete file).


Produce the populate_db.py streaming-chunks script (complete).


Produce the algorithm.py (manual O(n) with timing and top-K manual logic).


Produce the 2–3 page report skeleton (text you can paste into PDF).


Help you remove large files from git and show exact git commands.


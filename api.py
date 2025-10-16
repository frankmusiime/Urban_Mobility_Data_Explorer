from flask import Flask, jsonify
from sqlalchemy import create_engine, text
# import urllib.parse
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
# === MySQL Connection Details ===
DB_USER = "taxi_user"
DB_PASS = "Str0ng!Pass123"
DB_HOST = "localhost"
DB_PORT = "3306"
DB_NAME = "taxi_data"

engine_url = (
    f"mysql+mysqlconnector://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
engine = create_engine(engine_url)


@app.route("/api/trips", methods=["GET"])
def get_trips():
    with engine.connect() as conn:
        result = conn.execute(text("SELECT * FROM trips LIMIT 100000; "))
        trips = [dict(row._mapping) for row in result]
    return jsonify(trips)


if __name__ == "__main__":
    app.run(debug=True)
    

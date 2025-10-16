
"""
Custom Algorithm: Find Top Pickup Zones by Average Speed
Outputs top zones with their average speed and trip count, optionally by hour.
"""

import csv


def get_zone(lat, lon):
    """Group coordinates into 0.01° grid cells."""
    return f"{round(lat, 2)}_{round(lon, 2)}"


def fastest_pickup_areas(file_path, top_n=5):
    zone_speed_sum = {}
    zone_trip_count = {}

    with open(file_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            try:
                lat = float(row["pickup_latitude"])
                lon = float(row["pickup_longitude"])
                speed = float(row["speed_kmh"])
            except (ValueError, KeyError):
                continue

            zone = get_zone(lat, lon)

            if zone not in zone_speed_sum:
                zone_speed_sum[zone] = 0.0
                zone_trip_count[zone] = 0

            zone_speed_sum[zone] += speed
            zone_trip_count[zone] += 1

    # Compute average speeds
    zone_avg_speed = {}
    for zone in zone_speed_sum:
        avg_speed = zone_speed_sum[zone] / zone_trip_count[zone]
        zone_avg_speed[zone] = (avg_speed, zone_trip_count[zone])

    # Sort manually (descending) to get top N zones
    sorted_zones = []
    for zone, (avg_speed, count) in zone_avg_speed.items():
        inserted = False
        for i, (z, (s, c)) in enumerate(sorted_zones):
            if avg_speed > s:
                sorted_zones.insert(i, (zone, (avg_speed, count)))
                inserted = True
                break
        if not inserted:
            sorted_zones.append((zone, (avg_speed, count)))

    print(f"Top {top_n} Fastest Pickup Zones:")
    for i, (zone, (avg_speed, count)) in enumerate(
        sorted_zones[:top_n], start=1
            ):
        print(
            f"{i}. Zone:{zone}|Avg Speed:{avg_speed:.2f} km/h|Trips:{count}")

    return sorted_zones[:top_n]


if __name__ == "__main__":
    fastest_pickup_areas(
        "Urban_Mobility_Data_Explorer/clean_data.csv", top_n=5)

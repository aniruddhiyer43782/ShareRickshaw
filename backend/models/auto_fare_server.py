from flask import Flask, request, jsonify
from flask_cors import CORS
import math

app = Flask(__name__)
CORS(app)

# ---- Constants ----
BASE_FARE_DAY = 23        # base fare for first 1.5 km (RTO standard)
BASE_FARE_NIGHT = 30      # base fare for first 1.5 km post-midnight
FARE_PER_KM_DAY = 15      # after first 1.5 km (day)
FARE_PER_KM_NIGHT = 18    # after first 1.5 km (night rate)
PEAK_MULTIPLIER = 1.25    # 25% extra during rush hours or weekends


def calculate_dynamic_fare(distance_km, hour, day_of_week):
    """
    Calculates realistic Mumbai auto fares:
    - Adds night charge between 12 AM–5 AM
    - Applies peak-hour & weekend multipliers
    - Uses RTO day/night base and per km rates
    """
    is_night = (hour >= 0 and hour < 5)
    is_peak = (7 <= hour <= 10) or (17 <= hour <= 21)
    is_weekend = day_of_week in [5, 6]  # Saturday or Sunday

    # Base and per km rate based on time
    base_fare = BASE_FARE_NIGHT if is_night else BASE_FARE_DAY
    per_km_rate = FARE_PER_KM_NIGHT if is_night else FARE_PER_KM_DAY

    # RTO base fare covers first 1.5 km
    if distance_km <= 1.5:
        fare = base_fare
    else:
        fare = base_fare + (distance_km - 1.5) * per_km_rate

    # Apply traffic & weekend multiplier
    if is_peak or is_weekend:
        fare *= PEAK_MULTIPLIER

    # Round to nearest ₹5 (Mumbai meter rounding)
    fare = 5 * round(fare / 5)

    return max(fare, base_fare)


@app.route("/predict_fare", methods=["POST"])
def predict_fare():
    try:
        data = request.get_json()
        distance_km = float(data.get("distance_km", 0))
        hour = int(data.get("hour", 9))
        day_of_week = int(data.get("day_of_week", 2))

        if distance_km <= 0:
            return jsonify({"error": "Invalid distance"}), 400

        predicted_fare = calculate_dynamic_fare(distance_km, hour, day_of_week)

        return jsonify({
            "predicted_fare": predicted_fare,
            "message": "✅ Fare estimated using Mumbai RTO + peak-time adjustments"
        })

    except Exception as e:
        print("Error:", e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("✅ Mumbai Auto Fare Estimator server running...")
    app.run(host="0.0.0.0", port=5001, debug=True)

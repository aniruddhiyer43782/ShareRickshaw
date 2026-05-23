import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
import joblib
from math import radians, cos, sin, asin, sqrt

# --- Helper: Haversine distance ---
def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance between two coordinates (km)."""
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon, dlat = lon2 - lon1, lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1)*cos(lat2)*sin(dlon/2)**2
    return 6371 * 2 * asin(np.sqrt(a))

# --- 1️⃣ Load your dataset ---
df = pd.read_csv(r"C:\Users\ACER\OneDrive\Dokumen\GitHub\ShareRickshaw\backend\models\test_cab_fare.csv")
df = df.dropna()

# --- 2️⃣ Create synthetic auto-rickshaw fares since test file lacks fare_amount ---
df['fare_amount'] = np.random.uniform(25, 250, size=len(df))   # random base fares
df['fare_amount'] = df['fare_amount'] * 0.55 + np.random.normal(0, 3)  # scale to auto fares

# --- 3️⃣ Feature engineering ---
df['distance_km'] = df.apply(
    lambda r: haversine(r.pickup_latitude, r.pickup_longitude, r.dropoff_latitude, r.dropoff_longitude), axis=1
)
df['hour'] = pd.to_datetime(df['pickup_datetime']).dt.hour
df['day_of_week'] = pd.to_datetime(df['pickup_datetime']).dt.dayofweek

# Select features and label
X = df[['distance_km', 'hour', 'day_of_week']]
y = df['fare_amount']

# --- 4️⃣ Train the model ---
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestRegressor(n_estimators=120, max_depth=10, random_state=42)
model.fit(X_train, y_train)

# --- 5️⃣ Save model ---
print("✅ Model trained successfully!")
print("Example prediction for distance=5km, hour=9, day=2 → ₹", round(model.predict([[5, 9, 2]])[0], 2))
joblib.dump(model, r"C:\Users\ACER\OneDrive\Dokumen\GitHub\ShareRickshaw\backend\models\auto_fare_model.pkl")

print("💾 Model saved at backend/models/auto_fare_model.pkl")

const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

// POST /api/fare/calculate
router.post("/calculate", async (req, res) => {
  try {
    const { distance_km, hour, day_of_week } = req.body;

    const response = await fetch("http://127.0.0.1:5001/predict_fare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distance_km, hour, day_of_week }),
    });

    const data = await response.json();

    if (response.ok && data.predicted_fare) {
      return res.status(200).json({
        private_auto_fare: data.predicted_fare,
        message: data.message,
      });
    }

    return res.status(500).json({ error: "Invalid response from model" });
  } catch (err) {
    console.error("Fare route error:", err);
    res.status(500).json({ error: "Server error connecting to fare model" });
  }
});

module.exports = router;

const db = require("../config/database");
const {
  findMultimodalRoute: geminiFindRoute,
} = require("../services/geminiService");
const {
  normalizeCoordinateSet,
  buildDirectAutoOption,
  findSharedAutoCandidates,
  rankRouteCandidates,
  isNightTravel,
  buildSharedAutoOption,
  buildFallbackMultimodalRoute,
  attachValidation,
} = require("../services/routePlannerService");

async function fetchAllStandsData() {
  try {
    const [stands] = await db.query("SELECT * FROM stands ORDER BY name");

    return Promise.all(
      stands.map(async (stand) => {
        const [routes] = await db.query(
          "SELECT id, destination, fare, travel_time, destination_lat, destination_lng FROM routes WHERE stand_id = ? ORDER BY destination",
          [stand.id]
        );

        return {
          id: stand.id,
          name: stand.name,
          latitude: parseFloat(stand.latitude),
          longitude: parseFloat(stand.longitude),
          operating_hours: stand.operating_hours,
          routes: routes.map((route) => ({
            id: route.id,
            destination: route.destination,
            fare: parseFloat(route.fare),
            travel_time: route.travel_time,
            destination_lat:
              route.destination_lat !== null ? parseFloat(route.destination_lat) : null,
            destination_lng:
              route.destination_lng !== null ? parseFloat(route.destination_lng) : null,
          })),
        };
      })
    );
  } catch (error) {
    console.error("Database fetch error for stands data:", error);
    throw new Error("Failed to load shared auto stand data from database.");
  }
}

// POST /api/routes/multimodal
// Returns direct, deterministic shared-auto, and AI-assisted route options.
exports.findMultimodalRoute = async (req, res) => {
  const { startLat, startLng, endLat, endLng, departureTime } = req.body;
  const normalized = normalizeCoordinateSet(startLat, startLng, endLat, endLng);

  if (!normalized.valid) {
    return res.status(400).json({
      success: false,
      message: normalized.message,
    });
  }

  const coords = normalized.coords;

  try {
    const standsData = await fetchAllStandsData();
    const routes = [buildDirectAutoOption(coords)];

    const nightTravel = isNightTravel(departureTime || new Date());
    const sharedCandidates = rankRouteCandidates(
      findSharedAutoCandidates(coords, standsData, 5),
      { nightTravel }
    );
    const bestSharedAuto = buildSharedAutoOption(sharedCandidates[0]);
    if (bestSharedAuto) {
      routes.push(bestSharedAuto);
    }

    let aiRoute;
    try {
      aiRoute = await geminiFindRoute(
        coords.startLat,
        coords.startLng,
        coords.endLat,
        coords.endLng,
        standsData
      );
      const groundedAiRoute = attachValidation(aiRoute, standsData);
      routes.push({
        icon: "AI",
        type: groundedAiRoute.evidence.accepted
          ? "Grounded AI Multimodal Route"
          : "AI Multimodal Route (Review Required)",
        routeDescription: groundedAiRoute.routeDescription,
        estimatedCostRupees: groundedAiRoute.estimatedCostRupees,
        totalTravelTimeMinutes: groundedAiRoute.totalTravelTimeMinutes,
        lineColor: "#F2A900",
        steps: groundedAiRoute.steps,
        evidence: groundedAiRoute.evidence,
      });
    } catch (aiError) {
      console.warn("AI route planner unavailable, using deterministic fallback:", aiError.message);
      const fallback = buildFallbackMultimodalRoute(coords, standsData);
      routes.push({
        ...fallback,
        evidence: {
          ...fallback.evidence,
          aiFallbackReason: aiError.message,
        },
      });
    }

    res.json({
      success: true,
      routes,
      metadata: {
        plannerVersion: "grounded-route-planner-v1",
        standsLoaded: standsData.length,
        standRoutesLoaded: standsData.reduce(
          (total, stand) => total + (stand.routes ? stand.routes.length : 0),
          0
        ),
        sharedAutoCandidatesConsidered: sharedCandidates.length,
        trustAwareRanking: {
          enabled: true,
          nightTravel,
          algorithm: "trust-aware-shared-auto-ranking-v1",
        },
        notes: [
          "Direct auto fare is a prototype estimate, not an official tariff.",
          "OSRM is used by the browser map for visualization; backend route estimates are deterministic.",
          "AI routes are validated against known stand and route data before being returned.",
        ],
      },
    });
  } catch (error) {
    console.error("Multimodal route processing error:", error);
    res.status(500).json({
      success: false,
      message: `Failed to find multimodal routes: ${error.message}`,
    });
  }
};

// POST /api/routes
// Purpose: Add new route to a stand (protected - requires JWT)
exports.create = async (req, res) => {
  try {
    const {
      stand_id,
      destination,
      fare,
      travel_time,
      destination_lat,
      destination_lng,
    } = req.body;

    if (!stand_id || !destination || !fare || !travel_time || destination_lat === undefined || destination_lng === undefined) {
      return res.status(400).json({
        success: false,
        message: "stand_id, destination, fare, travel_time, destination_lat, and destination_lng are required",
      });
    }

    const [stands] = await db.query("SELECT id FROM stands WHERE id = ?", [stand_id]);
    if (stands.length === 0) {
      return res.status(400).json({ success: false, message: "Stand not found" });
    }

    const trimmedDestination = destination.trim();
    if (trimmedDestination.length < 3 || trimmedDestination.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Destination must be between 3 and 100 characters",
      });
    }

    const fareValue = parseFloat(fare);
    if (!Number.isFinite(fareValue) || fareValue < 5 || fareValue > 500) {
      return res.status(400).json({
        success: false,
        message: "Fare must be between Rs 5 and Rs 500",
      });
    }

    if (!travel_time.trim()) {
      return res.status(400).json({ success: false, message: "Travel time required" });
    }

    const destinationLatValue = parseFloat(destination_lat);
    const destinationLngValue = parseFloat(destination_lng);

    if (
      (destinationLatValue !== null && !Number.isFinite(destinationLatValue)) ||
      (destinationLngValue !== null && !Number.isFinite(destinationLngValue))
    ) {
      return res.status(400).json({
        success: false,
        message: "Destination coordinates must be numeric when supplied",
      });
    }

    const [result] = await db.query(
      `INSERT INTO routes
       (stand_id, destination, fare, travel_time, destination_lat, destination_lng)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        stand_id,
        trimmedDestination,
        fareValue,
        travel_time.trim(),
        destinationLatValue,
        destinationLngValue,
      ]
    );

    const [routes] = await db.query("SELECT * FROM routes WHERE id = ?", [result.insertId]);
    res.status(201).json({
      success: true,
      message: "Route created successfully",
      route: formatRoute(routes[0]),
    });
  } catch (error) {
    console.error("Create route error:", error);
    res.status(500).json({ success: false, message: "Failed to create route" });
  }
};

// PUT /api/routes/:id
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { destination, fare, travel_time, destination_lat, destination_lng } = req.body;

    const [existingRoutes] = await db.query("SELECT * FROM routes WHERE id = ?", [id]);
    if (existingRoutes.length === 0) {
      return res.status(404).json({ success: false, message: "Route not found" });
    }

    if (
      destination === undefined &&
      fare === undefined &&
      travel_time === undefined &&
      destination_lat === undefined &&
      destination_lng === undefined
    ) {
      return res.status(400).json({ success: false, message: "At least one field required" });
    }

    const updates = [];
    const params = [];

    if (destination !== undefined) {
      const trimmedDestination = destination.trim();
      if (trimmedDestination.length < 3 || trimmedDestination.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Destination must be between 3 and 100 characters",
        });
      }
      updates.push("destination = ?");
      params.push(trimmedDestination);
    }

    if (fare !== undefined) {
      const fareValue = parseFloat(fare);
      if (!Number.isFinite(fareValue) || fareValue < 5 || fareValue > 500) {
        return res.status(400).json({
          success: false,
          message: "Fare must be between Rs 5 and Rs 500",
        });
      }
      updates.push("fare = ?");
      params.push(fareValue);
    }

    if (travel_time !== undefined) {
      if (!travel_time.trim()) {
        return res.status(400).json({ success: false, message: "Travel time cannot be empty" });
      }
      updates.push("travel_time = ?");
      params.push(travel_time.trim());
    }

    if (destination_lat !== undefined) {
      const destinationLatValue = destination_lat === null ? null : parseFloat(destination_lat);
      if (destinationLatValue !== null && !Number.isFinite(destinationLatValue)) {
        return res.status(400).json({ success: false, message: "destination_lat must be numeric" });
      }
      updates.push("destination_lat = ?");
      params.push(destinationLatValue);
    }

    if (destination_lng !== undefined) {
      const destinationLngValue = destination_lng === null ? null : parseFloat(destination_lng);
      if (destinationLngValue !== null && !Number.isFinite(destinationLngValue)) {
        return res.status(400).json({ success: false, message: "destination_lng must be numeric" });
      }
      updates.push("destination_lng = ?");
      params.push(destinationLngValue);
    }

    params.push(id);
    await db.query(`UPDATE routes SET ${updates.join(", ")} WHERE id = ?`, params);

    const [updatedRoutes] = await db.query("SELECT * FROM routes WHERE id = ?", [id]);
    res.json({
      success: true,
      message: "Route updated successfully",
      route: formatRoute(updatedRoutes[0]),
    });
  } catch (error) {
    console.error("Update route error:", error);
    res.status(500).json({ success: false, message: "Failed to update route" });
  }
};

// DELETE /api/routes/:id
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const [routes] = await db.query("SELECT * FROM routes WHERE id = ?", [id]);
    if (routes.length === 0) {
      return res.status(404).json({ success: false, message: "Route not found" });
    }

    await db.query("DELETE FROM routes WHERE id = ?", [id]);
    res.json({ success: true, message: "Route deleted successfully" });
  } catch (error) {
    console.error("Delete route error:", error);
    res.status(500).json({ success: false, message: "Failed to delete route" });
  }
};

function formatRoute(route) {
  return {
    id: route.id,
    stand_id: route.stand_id,
    destination: route.destination,
    fare: parseFloat(route.fare),
    travel_time: route.travel_time,
    destination_lat:
      route.destination_lat !== null && route.destination_lat !== undefined
        ? parseFloat(route.destination_lat)
        : null,
    destination_lng:
      route.destination_lng !== null && route.destination_lng !== undefined
        ? parseFloat(route.destination_lng)
        : null,
    created_at: route.created_at,
    updated_at: route.updated_at,
  };
}

module.exports = {
  create: exports.create,
  update: exports.update,
  delete: exports.delete,
  findMultimodalRoute: exports.findMultimodalRoute,
};

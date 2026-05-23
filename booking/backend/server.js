/**
 * ShareRide - Minimal backend
 * - Uses lowdb (file JSON DB) for simplicity
 * - Token-based simple auth (nanoid)
 * - Endpoints:
 * /api/register, /api/login
 * /api/routes, /api/stands, /api/cars
 * /api/book, /api/bookings
 * /api/driver/update-location
 *
 * NOTE: This is an MVP for demonstration and NOT production ready.
 *
 * NEW LOGIC: Max passenger capacity set to 3. Multiple drivers can join the same route.
 * FIX: Booking now prioritizes a specific car_id sent from the frontend.
 *
 * UPDATE: Implemented new booking lifecycle: pending -> accepted -> picked -> dropped.
 * UPDATE: Added real-time driver proximity and status updates for passengers.
 * UPDATE: Decrement passenger count upon 'dropped' status.
 *
 * FIX: /api/driver/create-route logic modified: Routes are only matched by name if they
 * were previously created by the *same driver* OR the route name is 'Demo Route'.
 * Otherwise, a new route is created, allowing multiple generic routes in different places.
 *
 * FIX: Booking logic now uses OSRM (road distance) instead of Haversine (straight line)
 * to find the nearest car with space, solving the "just past the pickup" problem.
 *
 * FIX: Node.js ERR_REQUIRE_ESM error fixed by using dynamic import for 'node-fetch'.
 *
 * NEW FIX: Global search across all routes for the nearest available car (by OSRM duration)
 * to bypass potential localized route matching issues.
 */

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
// const fetch = require('node-fetch'); // REMOVED: Replaced with dynamic import inside getRoadDistance

const { nanoid } = require("nanoid");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// LowDB setup
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const file = path.join(__dirname, "db.json");
const adapter = new FileSync(file);
const db = low(adapter);

// Initialize defaults
db.defaults({
  users: [],
  cars: [],
  routes: [],
  stands: [],
  bookings: [],
}).write();

async function initDB() {
  await db.read();
  db.data = db.data || {
    users: [],
    cars: [],
    routes: [],
    stands: [],
    bookings: [],
  };
  await db.write();
}
initDB();

/* -------------------- Utilities -------------------- */

// Haversine distance (meters) - KEPT FOR POINT-TO-POINT CHECKS (e.g. pickup proximity)
function haversine(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

// Function to get the road distance and duration using OSRM
async function getRoadDistance(start, end) {
  try {
    // Dynamic import of node-fetch to resolve ERR_REQUIRE_ESM
    const { default: fetch } = await import("node-fetch");

    const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?steps=false&alternatives=false&geometries=geojson`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code === "Ok" && data.routes.length > 0) {
      // Returns distance in meters and duration in seconds
      return {
        distance: data.routes[0].distance,
        duration: data.routes[0].duration,
      };
    }
    // Fallback to null if routing fails
    return null;
  } catch (error) {
    console.error("OSRM Routing Error:", error);
    return null; // Handle API or network errors
  }
}

// Check for a point being 'near' a route (within 400m of any primary point)
function isPointNearAnyRoutePoint(routePoints, point, thresholdMeters = 400) {
  if (!routePoints || routePoints.length === 0) return false;
  for (const routePoint of routePoints) {
    if (haversine(point, routePoint) <= thresholdMeters) {
      return true;
    }
  }
  return false;
}

/* -------------------- Auth (simple token) -------------------- */

function requireToken(req, res, next) {
  const token = req.headers["x-auth-token"];
  if (!token) return res.status(401).json({ error: "Missing token" });
  const user = db.data.users.find((u) => u.token === token);
  if (!user) return res.status(401).json({ error: "Invalid token" });
  req.user = user;
  next();
}

/* -------------------- Routes -------------------- */

// Register
app.post("/api/register", async (req, res) => {
  await db.read();
  const { name, phone, role } = req.body;
  if (!phone || !name || !role)
    return res.status(400).json({ error: "name, phone, role required" });
  const existing = db.data.users.find((u) => u.phone === phone);
  if (existing)
    return res.status(400).json({ error: "Phone already registered" });
  const token = nanoid(24);
  const user = { id: nanoid(), name, phone, role, token };
  db.data.users.push(user);
  await db.write();
  res.json({
    message: "registered",
    token,
    user: { id: user.id, name, phone, role },
  });
});

// Login (simple: returns token if phone exists)
app.post("/api/login", async (req, res) => {
  await db.read();
  const { phone } = req.body;
  const user = db.data.users.find((u) => u.phone === phone);
  if (!user) return res.status(404).json({ error: "User not found" });
  // Issue new token
  user.token = nanoid(24);
  await db.write();
  res.json({
    token: user.token,
    user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
  });
});

/* -------------------- Cars & Routes -------------------- */

// Driver creates or joins a route
app.post("/api/driver/create-route", requireToken, async (req, res) => {
  await db.read();
  if (req.user.role !== "driver")
    return res.status(403).json({ error: "Only drivers allowed" });
  const {
    car_name,
    capacity = 3, // HARDCODED MAX CAPACITY TO 3
    route_name,
    route_points = [],
    actual_path_coords = [],
    stands = [],
  } = req.body;
  if (!route_points || route_points.length < 2)
    return res.status(400).json({ error: "route_points required (>=2)" });

  // 1. Try to find a route to join.
  // We only allow joining if the name is 'Demo Route' OR
  // if the driver previously created a route with that exact name.
  let route = db.data.routes.find(
    (r) =>
      r.route_name === route_name &&
      (route_name === "Demo Route" || r.driver_id === req.user.id)
  );

  // 2. If no matching route is found, create a new one.
  if (!route) {
    route = {
      id: nanoid(),
      driver_id: req.user.id, // Store which driver created this route
      car_id: null, // Will be linked to the first car in the route
      route_name,
      path: route_points,
      actual_path: actual_path_coords,
      created_at: Date.now(),
    };
    db.data.routes.push(route);

    // Add stands to the new route (Stands are always fresh for a new route ID)
    for (const s of stands) {
      const st = {
        id: nanoid(),
        route_id: route.id,
        name: s.name || "Stand",
        lat: s.lat,
        lng: s.lng,
      };
      db.data.stands.push(st);
    }
  }

  // 3. Create or update the driver's car associated with this route
  let car = db.data.cars.find((c) => c.driver_id === req.user.id);

  // Prepare car object
  const carData = {
    car_name: car_name,
    capacity: 3,
    current_passengers: 0,
    current_location: route_points[0],
    route_id: route.id, // Link car to the route
  };

  const message = car
    ? "driver updated car on route"
    : "driver created new car on route";

  if (car) {
    // Update existing car
    Object.assign(car, carData);
  } else {
    // Create new car
    car = {
      id: nanoid(),
      driver_id: req.user.id,
      ...carData,
    };
    db.data.cars.push(car);
  }

  // If this is the first car on the route, link the route's car_id (for historical reasons)
  if (!route.car_id) {
    route.car_id = car.id;
  }

  await db.write();
  res.json({
    message: message,
    car,
    route,
    stands: db.data.stands.filter((s) => s.route_id === route.id),
  });
});

// List all routes (with car and stands)
app.get("/api/routes", async (req, res) => {
  await db.read();
  // Get all unique routes
  const routesWithCars = db.data.routes.map((r) => {
    // Get all cars on this route
    const cars = db.data.cars
      .filter((c) => c.route_id === r.id)
      .map((car) => {
        // Attach driver name
        const driver = db.data.users.find((u) => u.id === car.driver_id);
        return { ...car, driver_name: driver ? driver.name : "Unknown Driver" };
      });

    const stands = db.data.stands.filter((s) => s.route_id === r.id);

    // For backwards compatibility and main display, we return all cars in an array.
    return { ...r, cars, stands };
  });

  res.json(routesWithCars);
});

// Get route by id
app.get("/api/routes/:id", async (req, res) => {
  await db.read();
  const r = db.data.routes.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "Route not found" });

  const cars = db.data.cars
    .filter((c) => c.route_id === r.id)
    .map((car) => {
      const driver = db.data.users.find((u) => u.id === car.driver_id);
      return { ...car, driver_name: driver ? driver.name : "Unknown Driver" };
    });

  const stands = db.data.stands.filter((s) => s.route_id === r.id);
  res.json({ ...r, cars, stands });
});

// Add a stand to route (Logic unchanged)
app.post("/api/routes/:id/add-stand", requireToken, async (req, res) => {
  await db.read();
  const route = db.data.routes.find((x) => x.id === req.params.id);
  if (!route) return res.status(404).json({ error: "Route not found" });
  if (req.user.role !== "driver")
    return res.status(403).json({ error: "Only drivers allowed" });
  // optional: check driver_id matches car owner
  const car = db.data.cars.find(
    (c) => c.route_id === route.id && c.driver_id === req.user.id
  );
  if (!car)
    // Now checks if driver has ANY car on this route
    return res.status(403).json({ error: "Not a driver on this route" });

  const { name, lat, lng } = req.body;
  if (lat == null || lng == null)
    return res.status(400).json({ error: "lat,lng required" });
  const stand = {
    id: nanoid(),
    route_id: route.id,
    name: name || "Stand",
    lat,
    lng,
  };
  db.data.stands.push(stand);
  await db.write();
  res.json({ message: "stand added", stand });
});

/* -------------------- Booking / Matching -------------------- */

// Create booking request (passenger)
app.post("/api/book", requireToken, async (req, res) => {
  await db.read();
  // NOTE: route_id is no longer strictly used for filtering, but for checking proximity to A route.
  const { pickup, dropoff, route_id } = req.body;

  if (req.user.role !== "passenger")
    return res.status(403).json({ error: "Only passengers can book" });

  const MAX_CAPACITY = 3;

  // --- START: GLOBAL SEARCH FOR NEAREST CAR WITH SPACE USING ROAD DISTANCE (ETA) ---

  // 1. Find all available cars across all routes
  const potentialCars = db.data.cars.filter(
    (c) => c.current_passengers < MAX_CAPACITY
  );

  if (potentialCars.length === 0) {
    return res.status(400).json({ error: "All cars are full or unavailable" });
  }

  let bestMatch = null;
  let minDuration = Infinity;

  for (const potentialCar of potentialCars) {
    if (potentialCar.current_location) {
      const routingResult = await getRoadDistance(
        potentialCar.current_location,
        pickup
      );

      if (routingResult) {
        // We use the OSRM duration to find the quickest path, which should inherently penalize long loops.
        if (routingResult.duration < minDuration) {
          minDuration = routingResult.duration;
          bestMatch = potentialCar;
        }
      }
    }
  }

  const car = bestMatch;
  // --- END: GLOBAL SEARCH ---

  if (!car) {
    return res
      .status(400)
      .json({ error: "No nearby car found with space via road network" });
  }

  // Find the route associated with the selected car for the subsequent proximity check
  const assignedRoute = db.data.routes.find((r) => r.id === car.route_id);
  if (!assignedRoute) {
    return res
      .status(500)
      .json({ error: "Assigned car is on an invalid route" });
  }

  // 3. Check if pickup is near route path (logic remains the same, but uses the car's route)
  const stands = db.data.stands.filter((s) => s.route_id === assignedRoute.id);
  let pickupType = "mid-route";
  const nearStand = stands.find(
    (s) => haversine({ lat: s.lat, lng: s.lng }, pickup) <= 200
  );
  if (nearStand) pickupType = "stand";

  if (pickupType === "mid-route") {
    const pathToCheck =
      assignedRoute.actual_path && assignedRoute.actual_path.length > 0
        ? assignedRoute.actual_path
        : assignedRoute.path;
    const nearRoute = isPointNearAnyRoutePoint(pathToCheck, pickup, 400);
    if (!nearRoute)
      return res.status(400).json({
        error: "Pickup not near a route (not within 400m of a main point)",
      });
  }

  // 4. Create booking linked to the best matched car/driver
  const booking = {
    id: nanoid(),
    passenger_id: req.user.id,
    route_id: assignedRoute.id, // Use the route ID of the assigned car
    pickup,
    dropoff,
    pickupType,
    status: "pending", // Set initial status to 'pending' as requested
    created_at: Date.now(),
    assigned_car: car.id,
    assigned_driver: car.driver_id,
  };
  db.data.bookings.push(booking);

  await db.write();
  res.json({ message: "booking created", booking });
});

// List bookings for user (Logic remains mostly the same)
app.get("/api/bookings", requireToken, async (req, res) => {
  await db.read();
  if (req.user.role === "passenger") {
    const books = db.data.bookings.filter(
      (b) => b.passenger_id === req.user.id
    );
    return res.json(books);
  } else if (req.user.role === "driver") {
    // bookings for routes of this driver (using car.route_id)
    const driverCar = db.data.cars.find((c) => c.driver_id === req.user.id);
    if (!driverCar) return res.json([]);

    // Filter bookings assigned to this specific car/driver
    const books = db.data.bookings.filter(
      (b) => b.assigned_driver === req.user.id
    );
    return res.json(books);
  } else {
    return res.json(db.data.bookings);
  }
});

/* -------------------- Driver updates -------------------- */

// Driver manually updates passenger count (Logic remains mostly the same)
app.post("/api/driver/update-passengers", requireToken, async (req, res) => {
  await db.read();
  if (req.user.role !== "driver")
    return res.status(403).json({ error: "Only drivers allowed" });

  const { passenger_count } = req.body;
  const MAX_CAPACITY = 3;

  if (
    typeof passenger_count !== "number" ||
    passenger_count < 0 ||
    passenger_count > MAX_CAPACITY
  )
    return res
      .status(400)
      .json({ error: `Invalid passenger_count. Must be 0-${MAX_CAPACITY}.` });

  // Find the driver's car
  const car = db.data.cars.find((c) => c.driver_id === req.user.id);

  if (!car)
    return res.status(404).json({ error: "Car not found for this driver" });

  car.current_passengers = passenger_count;
  await db.write();

  res.json({ message: "passenger count updated", car: { ...car } });
});

// Driver updates car current location (Logic remains mostly the same)
app.post("/api/driver/update-location", requireToken, async (req, res) => {
  await db.read();
  if (req.user.role !== "driver")
    return res.status(403).json({ error: "Only drivers allowed" });
  const { car_id, location } = req.body;
  const car = db.data.cars.find((c) => c.id === car_id);
  if (!car) return res.status(404).json({ error: "Car not found" });
  if (car.driver_id !== req.user.id)
    return res.status(403).json({ error: "Not owner" });
  car.current_location = location;
  await db.write();
  res.json({ message: "location updated", car });
});

/* -------------------- Misc -------------------- */

app.get("/", (req, res) => {
  res.send("ShareRide backend running");
});

/* -------------------- Start -------------------- */
/* -------------------- Start Server with Socket.io -------------------- */
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("✅ A user connected:", socket.id);

  socket.on("register-driver", (driverId) => {
    socket.join(`driver_${driverId}`);
    console.log(`🚗 Driver ${driverId} joined room`);
  });

  socket.on("register-passenger", (passengerId) => {
    socket.join(`passenger_${passengerId}`);
    console.log(`🧍 Passenger ${passengerId} joined room`);
  });

  // Live driver location and passenger count update
  socket.on("driver-location", async (data) => {
    await db.read();
    const car = db.data.cars.find((c) => c.id === data.car_id);
    if (car) {
      const carLocation = { lat: data.lat, lng: data.lng };
      // 1. Update car location in DB
      car.current_location = carLocation;

      // 2. Update passengers if provided by the driver frontend
      if (data.current_passengers != null) {
        car.current_passengers = data.current_passengers;
      }

      // 3. Find and process relevant bookings for this car
      const activeBookings = db.data.bookings.filter(
        (b) =>
          b.assigned_car === car.id &&
          (b.status === "accepted" || b.status === "picked")
      );

      let carPassengersUpdated = false;

      for (const booking of activeBookings) {
        let statusUpdated = false;
        let updateData = {
          bookingId: booking.id,
          carLocation,
          status: booking.status,
        };

        // --- PHASE 1: ACCEPTED -> PICKED ---
        if (booking.status === "accepted") {
          // Use Haversine for the final close-proximity check (no need for a full routing service just to check <50m)
          const distanceToPickup = haversine(carLocation, booking.pickup);
          updateData.distanceToPickup = distanceToPickup;

          if (distanceToPickup <= 150) {
            // Driver reached pickup location (within 50m)
            booking.status = "picked";
            statusUpdated = true;
            updateData.status = "picked";
            console.log(`Booking ${booking.id} status changed to PICKED`);
          }
        }

        // --- PHASE 2: PICKED -> DROPPED ---
        else if (booking.status === "picked") {
          // Use Haversine for the final close-proximity check
          const distanceToDropoff = haversine(carLocation, booking.dropoff);
          updateData.distanceToDropoff = distanceToDropoff;

          if (distanceToDropoff <= 150) {
            // Driver reached dropoff location (within 50m)
            booking.status = "dropped";
            statusUpdated = true;
            updateData.status = "dropped";

            // Decrement passenger count as requested
            if (car.current_passengers > 0) {
              car.current_passengers -= 1;
              carPassengersUpdated = true;
            }

            console.log(
              `Booking ${booking.id} status changed to DROPPED. Passengers remaining: ${car.current_passengers}`
            );
          }
        }

        // 4. Emit real-time status/proximity update to the passenger
        io.to(`passenger_${booking.passenger_id}`).emit(
          "booking-realtime-update",
          updateData
        );

        if (statusUpdated) {
          // Also send the final status via the existing 'booking-status' channel
          io.to(`passenger_${booking.passenger_id}`).emit(
            "booking-status",
            booking
          );
        }
      }

      // 5. Write DB changes if car location, passenger count, or booking status changed
      if (
        carPassengersUpdated ||
        activeBookings.some(
          (b) => b.status === "dropped" || b.status === "picked"
        )
      ) {
        await db.write();
      } else {
        // If only location changed, write location update
        await db.write();
      }

      // 6. Emit the map update (if passenger count was updated in this cycle, it will be broadcasted)
      io.emit("driver-location-update", {
        car_id: car.id,
        lat: carLocation.lat,
        lng: carLocation.lng,
        driver_id: car.driver_id,
        current_passengers: car.current_passengers,
        capacity: car.capacity,
      });
    }
  });

  // --- Step 2: Passenger requests booking ---
  socket.on("booking-request", async (data) => {
    const booking = data.booking;
    console.log("📦 New booking request received:", booking);
    // Notify the *specific* driver matched by the booking logic
    io.to(`driver_${booking.assigned_driver}`).emit("new-booking", booking);

    // Also send 'pending' status update to passenger
    io.to(`passenger_${booking.passenger_id}`).emit("booking-status", {
      ...booking,
      status: "pending", // Ensure frontend knows it's pending
    });
  });

  // --- Step 2: Driver responds ---
  socket.on("driver-response", async (data) => {
    const { bookingId, accepted, driverId } = data;
    await db.read();
    const booking = db.data.bookings.find((b) => b.id === bookingId);
    if (!booking) return;

    booking.status = accepted ? "accepted" : "rejected";

    // If accepted, manually increment passenger count (MVP logic)
    if (accepted) {
      const car = db.data.cars.find((c) => c.id === booking.assigned_car);
      const MAX_CAPACITY = 3;
      if (car && car.current_passengers < MAX_CAPACITY) {
        // Increment passenger count
        car.current_passengers += 1;
      } else if (car && car.current_passengers >= MAX_CAPACITY) {
        // Log an error if somehow accepted when full, but proceed to reject status update
        booking.status = "rejected";
        console.error("Attempted to accept booking on a full car. Rejecting.");
      }
    }

    await db.write();
    // Emit the status change (accepted/rejected)
    io.to(`passenger_${booking.passenger_id}`).emit("booking-status", booking);

    // If accepted, broadcast the updated car status (passengers) to the map
    if (booking.status === "accepted") {
      const car = db.data.cars.find((c) => c.id === booking.assigned_car);
      if (car) {
        // Send a location update to refresh the map and driver controls
        io.emit("driver-location-update", {
          car_id: car.id,
          lat: car.current_location.lat,
          lng: car.current_location.lng,
          driver_id: car.driver_id,
          current_passengers: car.current_passengers,
          capacity: car.capacity,
        });
      }
    }
  });

  // NEW: Manual status change for testing/driver controls (not required by user, but good for future)
  socket.on("update-booking-status-manual", async (data) => {
    // Logic for manual status updates (e.g., driver button for picking up/dropping off)
    // We will rely on automatic GPS triggering for this request.
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () =>
  console.log(`🚀 ShareRide backend + live tracking on ${PORT}`)
);

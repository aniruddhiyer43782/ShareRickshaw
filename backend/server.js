require('dotenv').config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();

console.log("🚀 Starting Mumbai Share Auto backend...");

// --- Initialize Express app ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:8000",
      "http://127.0.0.1:8000",
      "http://localhost:5500",
      "http://127.0.0.1:5500",
    ],
    credentials: true,
  },
});

// --- Middleware setup ---
app.use(
  cors({
    origin: [
      "http://localhost:8000",
      "http://127.0.0.1:8000",
      "http://localhost:5500",
      "http://127.0.0.1:5500",
    ],
    credentials: true,
  })
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// --- Database connection ---
require("./config/database");

// --- Socket setup ---
const socketAuth = require("./middleware/socketAuth");
const {
  setIoInstance,
  registerUserSocket,
  unregisterUserSocket,
} = require("./services/socketEmitter");

setIoInstance(io);
io.use(socketAuth);

io.on("connection", (socket) => {
  const userId = socket.userId;
  const userRole = socket.userRole;
  console.log(`User ${userId} (${userRole}) connected via WebSocket`);
  registerUserSocket(userId, socket);

  socket.on("disconnect", () => {
    console.log(`User ${userId} disconnected`);
    unregisterUserSocket(userId, socket.id);
  });
});

// --- Import route modules ---
const authRoutes = require("./routes/auth");
const profileRoutes = require("./routes/profile");
const standsRoutes = require("./routes/stands");
const routesRoutes = require("./routes/routes");

const bookingsRoutes = require("./routes/bookings");
const safetyRoutes = require("./routes/safety");
const fareRoutes = require("./routes/fare"); // ← your AI route

// --- API Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/stands", standsRoutes);
app.use("/api/routes", routesRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/safety", safetyRoutes);
app.use("/api/fare", fareRoutes);
console.log("✅ AI + RTO Fare route initialized");

// --- Driver status routes ---
const bookingsCtrl = require("./controllers/bookingsController");
const authMiddleware = require("./middleware/auth");
app.post(
  "/api/driver-status/update",
  authMiddleware,
  bookingsCtrl.updateDriverStatus
);
app.post(
  "/api/driver-status/location",
  authMiddleware,
  bookingsCtrl.updateDriverLocation
);

// --- Serve frontend static files ---
const path = require("path");
app.use(express.static(path.join(__dirname, "../")));

// --- Root endpoint ---
app.get("/api", (req, res) => {
  res.json({
    message: "Mumbai Share Auto API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      profile: "/api/profile",
      stands: "/api/stands",
      routes: "/api/routes",
      bookings: "/api/bookings",
      safety: "/api/safety",
      fare: "/api/fare",
      driverStatus: "/api/driver-status",
    },
  });
});

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

// --- Global error handler ---
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// --- Start the server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 API available at http://localhost:${PORT}/api`);
  console.log(`💬 WebSocket available on same port ${PORT}`);
});

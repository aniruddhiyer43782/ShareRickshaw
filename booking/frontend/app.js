// Simple frontend to interact with backend
const API = "http://localhost:4000/api";
const socket = io("http://localhost:4000");

socket.on("connect", () => console.log("✅ Socket connected:", socket.id));

let token = localStorage.getItem("sr_token") || null;
let currentUser = JSON.parse(localStorage.getItem("sr_user") || "null");

// --- State to track active booking for real-time proximity ---
let activeBooking = null;
let distanceInterval = null;
// -----------------------------------------------------------

// --- Register socket user role if already logged in ---
if (currentUser) {
  if (currentUser.role === "driver")
    socket.emit("register-driver", currentUser.id);
  if (currentUser.role === "passenger")
    socket.emit("register-passenger", currentUser.id);
}

const nameIn = document.getElementById("name");
const phoneIn = document.getElementById("phone");
const roleSel = document.getElementById("role");
const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const userInfo = document.getElementById("userInfo");

const driverControls = document.getElementById("driverControls");
const passengerControls = document.getElementById("passengerControls");
const createDemoRoute = document.getElementById("createDemoRoute");
const updateLocationBtn = document.getElementById("updateLocationBtn");
const driverMsg = document.getElementById("driverMsg");

// NEW: Live Driver Count Element
const liveDriverCountDisplay = document.getElementById("liveDriverCount");

// UPDATED: Passenger Control Elements (buttons and display)
const passengerCountInput = document.getElementById("passengerCount"); // Hidden input
const currentPassengerDisplay = document.getElementById(
  "currentPassengerDisplay"
);
const incrementPassengerBtn = document.getElementById("incrementPassengerBtn");
const decrementPassengerBtn = document.getElementById("decrementPassengerBtn");

// NEW: Custom Route Elements
const startRouteSelectionBtn = document.getElementById(
  "startRouteSelectionBtn"
);
const createCustomRouteBtn = document.getElementById("createCustomRouteBtn");
const routeNameInput = document.getElementById("routeNameInput");
const routeSelectMsg = document.getElementById("routeSelectMsg");
const routeCoordsDisplay = document.getElementById("routeCoordsDisplay");
const startCoordSpan = document.getElementById("startCoord");
const endCoordSpan = document.getElementById("endCoord");

const bookBtn = document.getElementById("bookBtn");
const passengerMsg = document.getElementById("passengerMsg");
const bookingsList = document.getElementById("bookingsList");
const refreshBookings = document.getElementById("refreshBookings");

// Keep track of routing controls to clear them
let routingControls = [];

// NEW: Driver Route Creation State
let isDriverCreatingRoute = false;
let startRouteMarker = null;
let endRouteMarker = null;
let currentRouteLine = null; // To display the in-progress route line

// Helper function to update the visible passenger count and enable/disable buttons
function updatePassengerDisplay(count) {
  const MAX_CAPACITY = 3;
  count = Math.max(0, Math.min(MAX_CAPACITY, count)); // Clamp value

  passengerCountInput.value = count; // Update hidden input
  currentPassengerDisplay.innerText = count; // Update visible span

  decrementPassengerBtn.disabled = count <= 0;
  incrementPassengerBtn.disabled = count >= MAX_CAPACITY;

  return count;
}

// Initial display setup
updatePassengerDisplay(0);

// Driver: Increment passenger count
incrementPassengerBtn.onclick = async () => {
  let currentCount = parseInt(passengerCountInput.value) || 0;
  const newCount = updatePassengerDisplay(currentCount + 1);
  // Send update to the backend immediately
  await sendPassengerCountUpdate(newCount);
};

// Driver: Decrement passenger count
decrementPassengerBtn.onclick = async () => {
  let currentCount = parseInt(passengerCountInput.value) || 0;
  const newCount = updatePassengerDisplay(currentCount - 1);
  // Send update to the backend immediately
  await sendPassengerCountUpdate(newCount);
};

// Function to call the API to update the passenger count
async function sendPassengerCountUpdate(count) {
  if (!currentUser || currentUser.role !== "driver") return;
  try {
    const res = await fetch(API + "/driver/update-passengers", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-auth-token": token },
      body: JSON.stringify({ passenger_count: count }),
    });
    const j = await res.json();
    if (res.ok) {
      driverMsg.innerText = `✅ Passenger count updated to ${j.car.current_passengers}.`;
      // Broadcast the change via socket to update the map popups for all users
      socket.emit("driver-location", {
        car_id: j.car.id,
        driver_id: currentUser.id,
        lat: j.car.current_location.lat,
        lng: j.car.current_location.lng,
        current_passengers: j.car.current_passengers,
      });
    } else {
      driverMsg.innerText = `Error updating passengers: ${
        j.error || "Server error"
      }`;
    }
  } catch (err) {
    console.error("Failed to update passenger count:", err);
    driverMsg.innerText = "Network error while updating passenger count.";
  }
}

function setUser(u, t) {
  currentUser = u;
  token = t;
  if (u) {
    localStorage.setItem("sr_user", JSON.stringify(u));
    localStorage.setItem("sr_token", t);

    // ✅ Register socket role immediately after login/register
    if (u.role === "driver") socket.emit("register-driver", u.id);
    if (u.role === "passenger") socket.emit("register-passenger", u.id);
  } else {
    localStorage.removeItem("sr_user");
    localStorage.removeItem("sr_token");
  }
  renderUserUI();
}

function renderUserUI() {
  if (!currentUser) {
    userInfo.innerText = "Not logged in";
    userInfo.classList.add("hidden");
    driverControls.style.display = "none";
    passengerControls.style.display = "none";
  } else {
    userInfo.innerHTML = `<i class="fas fa-check-circle"></i> ${currentUser.name} <small>(${currentUser.role})</small>`;
    userInfo.classList.remove("hidden");
    driverControls.style.display =
      currentUser.role === "driver" ? "block" : "none";
    passengerControls.style.display =
      currentUser.role === "passenger" ? "block" : "none";
  }
}

registerBtn.onclick = async () => {
  const name = nameIn.value;
  const phone = phoneIn.value;
  const role = roleSel.value;
  const res = await fetch(API + "/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, phone, role }),
  });
  const j = await res.json();
  if (j.token) setUser(j.user, j.token);
  else alert(j.error || JSON.stringify(j)); // Better feedback
};

loginBtn.onclick = async () => {
  const phone = phoneIn.value;
  const res = await fetch(API + "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const j = await res.json();
  if (j.token) setUser(j.user, j.token);
  else alert(j.error || "Login failed");
};

renderUserUI();

/* ---------------- Map ---------------- */
const map = L.map("map").setView([19.076, 72.8777], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

// Define default marker icons for start/end points to fix the L.ExtraMarkers error
const startIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/2990/2990806.png", // Green start icon
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const endIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3257/3257371.png", // Red end icon
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

let routeLayers = [];
let pickupMarker = null;
let dropMarker = null;
let lastRoutes = [];

// Storage for the computed road path coordinates
let currentRoutePath = [];

async function loadRoutes() {
  constQH = API + "/routes";
  try {
    const res = await fetch(API + "/routes");
    const routes = await res.json();

    // clear old route layers and routing controls
    routeLayers.forEach((l) => map.removeLayer(l));
    routeLayers = [];
    routingControls.forEach((c) => map.removeControl(c));
    routingControls = [];

    // Used to track which cars are currently live (for driver count display)
    const carsOnMap = {};

    routes.forEach((r) => {
      // FIX: Use Leaflet Routing Machine for road-following lines
      if (r.path && r.path.length >= 2) {
        // Prioritize actual_path if available for driver simulation (but not for initial display waypoints)
        // The initial display waypoints should use the path points defined by the driver.
        const waypoints = [
          L.latLng(r.path[0].lat, r.path[0].lng),
          L.latLng(
            r.path[r.path.length - 1].lat,
            r.path[r.path.length - 1].lng
          ),
        ];

        const control = L.Routing.control({
          waypoints: waypoints,
          routeWhileDragging: false,
          addWaypoints: false,
          show: false, // Hide instructions panel
          fitSelectedRoutes: false, // Prevent zooming to the route
          router: L.Routing.osrmv1({
            serviceUrl: "https://router.project-osrm.org/route/v1",
          }),
          lineOptions: {
            styles: [{ color: "#2563eb", weight: 4 }],
          },
          createMarker: function () {
            return null;
          }, // Don't add markers for start/end points
        }).addTo(map);

        // Store control to remove it later
        routingControls.push(control);

        // We need to wait for the route to be found before we can bind the popup to the line
        control.on("routesfound", function (e) {
          const routeLine = e.routes[0].coordinates;
          const poly = L.polyline(routeLine, {
            color: "#2563eb",
            weight: 4,
          }).addTo(map);
          poly.bindPopup(
            `<b>${r.route_name || "Route"}</b><br/>
             Cars: ${r.cars.length} available<br/>`
          );
          routeLayers.push(poly);

          // Update the driver's passenger input field/display to reflect current state
          if (currentUser?.role === "driver") {
            const myCar = r.cars.find((c) => c.driver_id === currentUser.id);
            if (myCar) {
              currentRoutePath = routeLine.map((p) => ({
                lat: p.lat,
                lng: p.lng,
              }));
              if (myCar.current_passengers != null) {
                updatePassengerDisplay(myCar.current_passengers);
              }
            }
          }
        });

        control.on("routingerror", function (e) {
          // Fallback to straight polyline if routing fails
          console.error("Routing failed for route:", r.route_name, e.error);
          const latlngs = r.path.map((p) => [p.lat, p.lng]);
          const poly = L.polyline(latlngs, {
            color: "#2563eb",
            dashArray: "5, 5",
          }).addTo(map);
          poly.bindPopup(
            `<b>${
              r.route_name || "Route"
            } (Road routing failed, straight line shown)</b>`
          );
          routeLayers.push(poly);
        });
      }

      // stands
      r.stands.forEach((s) => {
        const m = L.circleMarker([s.lat, s.lng], {
          radius: 6,
          color: "#10b981",
        }).addTo(map);
        m.bindPopup(`<b>${s.name}</b>`);
        routeLayers.push(m);
      });
    });

    lastRoutes = routes;
  } catch (e) {
    console.error("Failed to load routes", e);
  }

  // Update Driver Count based on available cars linked to routes
  // This is a rough count of known drivers, not necessarily "live" ones.
  // The socket listener handles the truly live count.
  // For the moment, we'll rely on the socket listener logic to update the display.
}

loadRoutes();

// Helper to update the driver's route selection UI
function updateDriverRouteSelectionUI() {
  const startSet = !!startRouteMarker;
  const endSet = !!endRouteMarker;
  const routeName = routeNameInput.value.trim();

  let actionText = "Create New Route";
  // Check if a route with this name exists AND if the current driver created it, or if it's the Demo Route
  const driverRouteExists = lastRoutes.some(
    (r) =>
      r.route_name === routeName &&
      (routeName === "Demo Route" || r.driver_id === currentUser?.id)
  );

  if (routeName && driverRouteExists) {
    actionText = `Join: ${routeName}`;
  } else if (routeName) {
    actionText = `Create: ${routeName}`;
  }

  createCustomRouteBtn.innerText = actionText;

  routeSelectMsg.innerText = isDriverCreatingRoute
    ? `Mode: ${startSet ? (endSet ? "Done" : "Set Dropoff") : "Set Pickup"}`
    : "Click 'Start Selection' to select points.";

  startCoordSpan.innerText = startSet
    ? `${startRouteMarker.getLatLng().lat.toFixed(4)}, ${startRouteMarker
        .getLatLng()
        .lng.toFixed(4)}`
    : "N/A";
  endCoordSpan.innerText = endSet
    ? `${endRouteMarker.getLatLng().lat.toFixed(4)}, ${endRouteMarker
        .getLatLng()
        .lng.toFixed(4)}`
    : "N/A";

  routeCoordsDisplay.style.display = startSet || endSet ? "block" : "none";
  createCustomRouteBtn.disabled = !(startSet && endSet && routeName);

  if (!isDriverCreatingRoute) {
    startRouteSelectionBtn.innerText = "Start Selection";
    startRouteSelectionBtn.classList.remove("btn-danger");
    startRouteSelectionBtn.classList.add("btn-secondary");
    // FIX 1: Add existence check for currentRouteLine before removing
    if (currentRouteLine) {
      map.removeLayer(currentRouteLine);
      currentRouteLine = null;
    }
  } else {
    startRouteSelectionBtn.innerText = "Cancel";
    startRouteSelectionBtn.classList.remove("btn-secondary");
    startRouteSelectionBtn.classList.add("btn-danger"); // Use a red button for cancel
  }
}

// Function to reset driver route selection
function resetDriverRouteSelection() {
  isDriverCreatingRoute = false;
  if (startRouteMarker) map.removeLayer(startRouteMarker);
  if (endRouteMarker) map.removeLayer(endRouteMarker);
  startRouteMarker = null;
  endRouteMarker = null;
  updateDriverRouteSelectionUI();
}

// Monitor route name changes to update button text
routeNameInput.oninput = updateDriverRouteSelectionUI;

// Custom Route Selection Button Handler
startRouteSelectionBtn.onclick = () => {
  isDriverCreatingRoute = !isDriverCreatingRoute; // Toggle mode
  if (!isDriverCreatingRoute) {
    resetDriverRouteSelection();
    driverMsg.innerText = "Custom route creation cancelled.";
  } else {
    // Clear any previous selection when starting a new one
    resetDriverRouteSelection();
    isDriverCreatingRoute = true; // Set back to true after reset
    driverMsg.innerText = "Click map to set START location.";
  }
  updateDriverRouteSelectionUI();
};

// Create Custom Route Button Handler
createCustomRouteBtn.onclick = async () => {
  if (!startRouteMarker || !endRouteMarker || !currentUser) return;

  // FIX 2: Check for token authorization before attempting to fetch
  if (!token) {
    driverMsg.innerText = "Error: Not authorized. Please log in first.";
    return;
  }

  driverMsg.innerText = "Calculating route path...";
  createCustomRouteBtn.disabled = true;

  const startPoint = startRouteMarker.getLatLng();
  const endPoint = endRouteMarker.getLatLng();
  const routeName = routeNameInput.value.trim() || "Custom Route";

  // Temporarily draw a control to get the actual road coordinates
  let tempControl = L.Routing.control({
    waypoints: [
      L.latLng(startPoint.lat, startPoint.lng),
      L.latLng(endPoint.lat, endPoint.lng),
    ],
    routeWhileDragging: false,
    addWaypoints: false,
    show: false,
    router: L.Routing.osrmv1({
      serviceUrl: "https://router.project-osrm.org/route/v1",
    }),
  }).addTo(map);

  tempControl.on("routesfound", async function (e) {
    const actualPathCoords = e.routes[0].coordinates.map((p) => ({
      lat: p.lat,
      lng: p.lng,
    }));
    map.removeControl(tempControl); // Remove the temporary control

    const routeData = {
      car_name: `${currentUser.name}'s Auto`,
      capacity: 3,
      route_name: routeName,
      // route_points are the simple start/end points
      route_points: [
        { lat: startPoint.lat, lng: startPoint.lng },
        { lat: endPoint.lat, lng: endPoint.lng },
      ],
      actual_path_coords: actualPathCoords,
      // For a custom route, we won't define stands initially
      stands: [],
    };

    const res = await fetch(API + "/driver/create-route", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-auth-token": token },
      body: JSON.stringify(routeData),
    });
    const j = await res.json();
    driverMsg.innerText = `✅ Route set! ${j.route.route_name}`;

    resetDriverRouteSelection(); // Clean up markers and selection mode
    // Ensure button is enabled for next use
    createCustomRouteBtn.disabled = false;
    await loadRoutes();
  });

  tempControl.on("routingerror", function (e) {
    map.removeControl(tempControl);
    // FIX 3: Display a generic error message instead of relying on undefined properties in j
    console.error("Failed to get road path for new route:", e.error);
    driverMsg.innerText =
      "Error: Could not calculate road path. Please select different points.";
    // FIX: Re-enable the button so the user can try again
    createCustomRouteBtn.disabled = false;
  });
};

/* Map click: choose pickup / dropoff (Passenger) OR Start/End (Driver) */
let clickMode = "pickup";
map.on("click", (e) => {
  const latlng = e.latlng;

  // --- DRIVER ROUTE SELECTION LOGIC ---
  if (currentUser && currentUser.role === "driver" && isDriverCreatingRoute) {
    if (!startRouteMarker) {
      // FIX: Use defined startIcon instead of L.ExtraMarkers.icon()
      startRouteMarker = L.marker(latlng, { draggable: false, icon: startIcon })
        .addTo(map)
        .bindPopup("Route Start")
        .openPopup();
      driverMsg.innerText = "Start set. Click again to set END.";
    } else if (!endRouteMarker) {
      // FIX: Use defined endIcon instead of L.ExtraMarkers.icon()
      endRouteMarker = L.marker(latlng, { draggable: false, icon: endIcon })
        .addTo(map)
        .bindPopup("Route End")
        .openPopup();

      // Draw a straight line between the points for preview
      const latlngs = [
        startRouteMarker.getLatLng(),
        endRouteMarker.getLatLng(),
      ];
      currentRouteLine = L.polyline(latlngs, {
        color: "#888",
        dashArray: "5, 10",
        weight: 3,
      }).addTo(map);

      driverMsg.innerText = "End set. Click 'Create Route'.";
    } else {
      // Both set, ignore clicks until reset
      return;
    }
    updateDriverRouteSelectionUI();
    return;
  }
  // --- END DRIVER ROUTE SELECTION LOGIC ---

  // --- PASSENGER BOOKING LOGIC ---
  if (!currentUser || currentUser.role !== "passenger") return;

  // Clear driver markers if they exist before processing passenger click
  if (startRouteMarker || endRouteMarker) {
    resetDriverRouteSelection();
  }

  if (!pickupMarker) {
    pickupMarker = L.marker(latlng, { draggable: true, icon: startIcon })
      .addTo(map)
      .bindPopup("Pickup")
      .openPopup();
    pickupMarker.on("dragend", () => {});
    clickMode = "drop";
    bookBtn.disabled = false;
    passengerMsg.innerText = "Pickup set. Click to set dropoff.";
  } else if (!dropMarker) {
    dropMarker = L.marker(latlng, { draggable: true, icon: endIcon })
      .addTo(map)
      .bindPopup("Dropoff")
      .openPopup();
    passengerMsg.innerText = "Dropoff set. Click 'Request Ride'.";
    bookBtn.disabled = false;
    clickMode = "pickup";
  }
});

// Function to synchronously update the backend and UI when buttons are clicked
async function handlePassengerCountButtonClick(delta) {
  if (!currentUser || currentUser.role !== "driver") return;

  let currentCount = parseInt(passengerCountInput.value) || 0;
  const newCount = currentCount + delta;

  // Use the backend update function
  await sendPassengerCountUpdate(newCount);
}

// Attach listeners to the buttons
decrementPassengerBtn.onclick = () => handlePassengerCountButtonClick(-1);
incrementPassengerBtn.onclick = () => handlePassengerCountButtonClick(1);

/* Create demo route (driver) */
// This function remains to easily create a pre-defined route for testing
createDemoRoute.onclick = async () => {
  if (!currentUser) return console.error("Login as driver");

  // FIX 2: Check for token authorization before attempting to fetch
  if (!token) {
    driverMsg.innerText = "Error: Not authorized. Please log in first.";
    return;
  }

  // Clear any active custom route selection
  resetDriverRouteSelection();

  // small demo route in Bandra area
  const demoPoints = [
    { lat: 19.06, lng: 72.83 },
    { lat: 19.067, lng: 72.835 },
    { lat: 19.075, lng: 72.843 },
    { lat: 19.082, lng: 72.852 },
    { lat: 19.089, lng: 72.86 },
  ];
  const stands = [
    { name: "Stand A", lat: 19.06, lng: 72.83 },
    { name: "Stand B", lat: 19.075, lng: 72.843 },
    { name: "Stand C", lat: 19.089, lng: 72.86 },
  ];

  driverMsg.innerText = "Loading Demo Route...";

  // Temporarily draw a control to get the actual road coordinates
  let tempControl = L.Routing.control({
    waypoints: [
      L.latLng(demoPoints[0].lat, demoPoints[0].lng),
      L.latLng(
        demoPoints[demoPoints.length - 1].lat,
        demoPoints[demoPoints.length - 1].lng
      ),
    ],
    routeWhileDragging: false,
    addWaypoints: false,
    show: false,
    router: L.Routing.osrmv1({
      serviceUrl: "https://router.project-osrm.org/route/v1",
    }),
  }).addTo(map);

  tempControl.on("routesfound", async function (e) {
    const actualPathCoords = e.routes[0].coordinates.map((p) => ({
      lat: p.lat,
      lng: p.lng,
    }));
    map.removeControl(tempControl); // Remove the temporary control

    const res = await fetch(API + "/driver/create-route", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-auth-token": token },
      body: JSON.stringify({
        car_name: `${currentUser.name}'s Demo Auto`,
        capacity: 4, // Will be overridden to 3 by backend
        route_name: "Demo Route", // All drivers join this fixed route
        // Only send start/end points for the API call to work with the routing machine
        route_points: [demoPoints[0], demoPoints[demoPoints.length - 1]],
        actual_path_coords: actualPathCoords, // Pass the road path to the backend
        stands,
      }),
    });
    const j = await res.json();
    driverMsg.innerText = `✅ Demo Route Active`;
    await loadRoutes();
  });

  tempControl.on("routingerror", function (e) {
    map.removeControl(tempControl);
    console.error("Failed to get road path for demo route:", e.error);
    driverMsg.innerText =
      "Error: Could not calculate road path for demo. Try again.";
  });
};

/* Update driver location (random) */
updateLocationBtn.onclick = async () => {
  const resR = await fetch(API + "/routes");
  const routes = await resR.json();

  // Find the driver's specific car (linked to their ID)
  let myCar = null;
  routes.forEach((r) => {
    const foundCar = r.cars.find((c) => c.driver_id === currentUser.id);
    if (foundCar) {
      myCar = foundCar;
      // Use the route's path associated with the car's route_id
      const myRoute = lastRoutes.find((lr) => lr.id === foundCar.route_id);
      if (myRoute) {
        // Ensure currentRoutePath is updated with the path of the route the driver is on
        currentRoutePath =
          myRoute.actual_path && myRoute.actual_path.length > 0
            ? myRoute.actual_path
            : myRoute.path;
      }
    }
  });

  if (!myCar)
    return alert("No car/route found for this driver. Create one first.");

  const path = currentRoutePath;

  if (path.length < 2) {
    driverMsg.innerText = "Error: Route is too short. Create a route first.";
    return;
  }

  // Stop any previous movement simulation before starting a new one
  if (window.moveInterval) {
    clearInterval(window.moveInterval);
  }

  // --- UPDATED PING-PONG MOVEMENT LOGIC ---
  let idx = 0;
  let direction = 1; // 1 for forward (A to B), -1 for backward (B to A)

  window.moveInterval = setInterval(() => {
    // 1. Send current location and passenger count
    const location = path[idx];

    // We fetch the current passenger count from the hidden input/display
    const live_passengers = parseInt(passengerCountInput.value) || 0;

    socket.emit("driver-location", {
      car_id: myCar.id, // Use the driver's unique car ID
      driver_id: currentUser.id,
      lat: location.lat,
      lng: location.lng,
      current_passengers: live_passengers,
    });

    // 2. Determine new direction and update index
    if (idx === path.length - 1 && direction === 1) {
      direction = -1; // Reached end, reverse
    } else if (idx === 0 && direction === -1) {
      direction = 1; // Reached start, reverse
    }

    // Advance index for the next step
    idx += direction;
  }, 500); // 500ms update frequency

  driverMsg.innerText = "🚗 Live tracking started!";
};

/* Book ride */
bookBtn.onclick = async () => {
  if (!pickupMarker || !dropMarker)
    return alert("Set pickup and dropoff first");

  // Reset passenger message and active booking state for a new request
  passengerMsg.innerHTML = "Requesting ride...";
  activeBooking = null; // Clear previous active booking

  // Refresh routes to get the latest passenger count and car status
  await loadRoutes();
  if (!lastRoutes || lastRoutes.length === 0) {
    passengerMsg.innerHTML = "No routes available. Please try again later.";
    return;
  }

  // NOTE: We don't need to select a route ID here. The backend is now searching globally
  // for the nearest available car across ALL routes. The API structure requires a route_id
  // to be sent, but we can send the ID of the *first* route that has an available car,
  // and the backend will find the best car globally.

  const MAX_CAPACITY = 3;

  // Find a route ID to satisfy the API structure, if one has an available car.
  const routeWithAvailableCar = lastRoutes.find((route) =>
    route.cars.some((car) => car.current_passengers < MAX_CAPACITY)
  );

  if (!routeWithAvailableCar) {
    passengerMsg.innerHTML = "❌ No available cars found with space.";
    return;
  }

  const routeIdToSend = routeWithAvailableCar.id;

  const pickupPoint = pickupMarker.getLatLng();

  // 2. Attempt to book, trusting the backend to find the nearest car (by road distance/duration)
  try {
    const res = await fetch(API + "/book", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-auth-token": token },
      body: JSON.stringify({
        // Send a valid route ID (required by API structure) but trust global matching on the backend
        route_id: routeIdToSend,
        pickup: {
          lat: pickupPoint.lat,
          lng: pickupPoint.lng,
        },
        dropoff: {
          lat: dropMarker.getLatLng().lat,
          lng: dropMarker.getLatLng().lng,
        },
      }),
    });
    const j = await res.json();
    if (res.ok && j.booking) {
      activeBooking = j.booking; // Store the new booking ID and data

      // Since the backend chose the driver, we must look up the assigned driver's name
      let assignedDriverName = "Driver";
      if (j.booking.assigned_car) {
        // Re-fetch routes to get the latest car data including driver names
        await loadRoutes();
        const assignedCar = lastRoutes
          .flatMap((r) => r.cars)
          .find((c) => c.id === j.booking.assigned_car);
        if (assignedCar) {
          assignedDriverName = assignedCar.driver_name;
        }
      }

      passengerMsg.innerHTML =
        `✅ Request Sent to **${assignedDriverName}**! ` +
        `Waiting for confirmation...`;

      socket.emit("booking-request", { booking: j.booking }); // Send request to the specific assigned driver
    } else {
      passengerMsg.innerHTML = `❌ Failed: ${j.error || "Check console."}`;
      console.log("Booking rejected by API:", j);
    }
  } catch (err) {
    console.error(err);
    passengerMsg.innerHTML = "Network error during booking.";
  }

  await refreshBookingsList();
};

/* Bookings */
async function refreshBookingsList() {
  if (!currentUser) return;

  // Ensure we have the latest driver/car data to map names
  if (!lastRoutes || lastRoutes.length === 0) await loadRoutes();

  const res = await fetch(API + "/bookings", {
    headers: { "x-auth-token": token },
  });
  const j = await res.json();

  bookingsList.innerHTML = "";
  if (j.length === 0) {
    bookingsList.innerHTML =
      '<div class="empty-state"><i class="fas fa-clipboard-list"></i> No active bookings</div>';
    return;
  }

  // Show newest first
  j.reverse().forEach((b) => {
    const card = document.createElement("div");
    card.className = "booking-card";

    const shortId = b.id.slice(-4);
    const statusClass = `status-${b.status}`;

    // Resolve Driver/Car Name if possible
    let mainInfo = "";
    let subInfo = "";

    if (currentUser.role === "passenger") {
      let driverName = "Finding Driver...";
      let carName = "";

      if (b.assigned_car) {
        // Look through all routes to find this car
        for (const r of lastRoutes) {
          const car = r.cars.find((c) => c.id === b.assigned_car);
          if (car) {
            driverName = car.driver_name;
            carName = car.car_name || "Auto Rickshaw";
            break;
          }
        }
      }

      if (b.status === "pending") {
        driverName = "Waiting for response...";
        carName = "";
      } else if (b.status === "rejected") {
        driverName = "Driver Unavailable";
      }

      mainInfo = `<i class="fas fa-user-tie"></i> ${driverName}`;
      subInfo = carName ? `<i class="fas fa-taxi"></i> ${carName}` : "";
    } else {
      // Driver View: Show generic passenger info (Name is not in booking object in this MVP)
      mainInfo = `<i class="fas fa-user"></i> Passenger Request`;
      subInfo = `<span style="font-size:0.8rem; color:#64748b;">Trip ID: ${shortId}</span>`;
    }

    card.innerHTML = `
      <div class="booking-card-header">
        <span class="booking-id">ORDER #${shortId}</span>
        <span class="status-badge ${statusClass}">${b.status}</span>
      </div>
      
      <div class="booking-body">
        <div class="primary-info">${mainInfo}</div>
        ${subInfo ? `<div class="secondary-info">${subInfo}</div>` : ""}
        
        <div class="mini-timeline">
            <div class="timeline-item">
                <div class="dot pick"></div>
                <span>Pickup Set</span>
            </div>
            <div class="line"></div>
            <div class="timeline-item">
                <div class="dot drop"></div>
                <span>Dropoff Set</span>
            </div>
        </div>
      </div>
    `;
    bookingsList.appendChild(card);
  });
}
refreshBookings.onclick = refreshBookingsList;

/* ========== Live Tracking Listener ========== */
let liveMarkers = {}; // car_id -> marker

socket.on("driver-location-update", (data) => {
  console.log("📍 Driver update:", data);
  const { car_id, lat, lng, driver_id, current_passengers, capacity } = data;

  // Find driver name for popup title
  const route = lastRoutes.find((r) => r.cars.some((c) => c.id === car_id));
  const carData = route ? route.cars.find((c) => c.id === car_id) : null;
  const driverName = carData ? carData.driver_name : "Driver";

  // Count active markers/drivers
  // Update: We only count the cars that are actively emitting location updates
  if (!liveMarkers[car_id]) {
    // If it's a new marker, check if a driver is logged in and needs the location data
    if (currentUser?.role === "driver" && currentUser.id === driver_id) {
      loadRoutes(); // Reload to ensure currentRoutePath is correct for simulation
    }
  }

  // 1. Update Map Marker Location
  if (liveMarkers[car_id]) {
    liveMarkers[car_id].setLatLng([lat, lng]);
  } else {
    const marker = L.marker([lat, lng], {
      icon: L.icon({
        iconUrl: "https://cdn-icons-png.flaticon.com/512/64/64096.png",
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      }),
    }).addTo(map);
    liveMarkers[car_id] = marker;
  }

  // 2. Update Marker Popup (Live Passenger Count & Name)
  const popupContent = `
    <div style="font-family:Inter, sans-serif;">
      <strong>🚕 ${driverName}'s Auto</strong><br/>
      Pass: ${current_passengers}/${capacity || 3}<br/>
      Route: ${route ? route.route_name : "Unknown"}
    </div>
  `;
  liveMarkers[car_id].setPopupContent(popupContent);

  // 3. Update Driver's Own Input Field/Display if it's their car
  if (
    currentUser &&
    currentUser.role === "driver" &&
    currentUser.id === driver_id
  ) {
    updatePassengerDisplay(current_passengers);
  }

  // Update live driver count display after processing all markers
  liveDriverCountDisplay.innerText = `Active Drivers: ${
    Object.keys(liveMarkers).length
  }`;
});

/* ========== Driver: Receive booking requests - FIXED to use custom UI ========== */
socket.on("new-booking", (booking) => {
  if (
    currentUser &&
    currentUser.role === "driver" &&
    booking.assigned_driver === currentUser.id
  ) {
    console.log("🧾 New booking request:", booking);

    // FIX: Replace blocking confirm() with a custom UI card and buttons.
    const container = document.createElement("div");
    container.id = `booking-${booking.id}`;
    container.className = "new-booking-card";
    container.innerHTML = `
      <div style="font-weight: 600; color: var(--primary); margin-bottom:6px;">New Ride Request!</div>
      <div style="font-size:0.8rem; margin-bottom:8px;">Pickup: ${booking.pickup.lat.toFixed(
        4
      )}, ${booking.pickup.lng.toFixed(4)}</div>
      <div class="actions">
        <button data-action="accept" class="btn btn-success btn-sm" style="flex:1;">Accept</button>
        <button data-action="reject" class="btn btn-danger btn-sm" style="flex:1;">Reject</button>
      </div>
    `;

    // Clear previous message and append the new booking card
    const msgContainer = document.getElementById("driverMsg");
    // Clear out only the booking card, keep other messages if possible
    const existingCard = msgContainer.querySelector(".new-booking-card");
    if (existingCard) existingCard.remove();
    msgContainer.appendChild(container);

    const handleResponse = (accepted) => {
      // Send the driver's response to the backend
      socket.emit("driver-response", {
        bookingId: booking.id,
        accepted: accepted,
        driverId: currentUser.id,
      });
      // Update the driver message and remove the prompt
      msgContainer.innerText = `Booking ${accepted ? "accepted" : "rejected"}.`;
      container.remove();
      refreshBookingsList(); // Driver refreshes their list
    };

    container.querySelector('[data-action="accept"]').onclick = () =>
      handleResponse(true);
    container.querySelector('[data-action="reject"]').onclick = () =>
      handleResponse(false);
  }
});

/* ========== Passenger: Receive real-time updates (Proximity/Auto-Status) ========== */
socket.on("booking-realtime-update", (data) => {
  if (
    currentUser &&
    currentUser.role === "passenger" &&
    activeBooking &&
    activeBooking.id === data.bookingId
  ) {
    const { status, distanceToPickup, distanceToDropoff } = data;

    // Format distance in a readable way (meters or kilometers)
    let formattedDistance = "N/A";
    if (status === "accepted" && distanceToPickup != null) {
      if (distanceToPickup > 1000) {
        formattedDistance = `${(distanceToPickup / 1000).toFixed(2)} km`;
      } else {
        formattedDistance = `${distanceToPickup.toFixed(0)} m`;
      }
    } else if (status === "picked" && distanceToDropoff != null) {
      // Driver is en route to dropoff, display distance to dropoff
      if (distanceToDropoff > 1000) {
        formattedDistance = `${(distanceToDropoff / 1000).toFixed(
          2
        )} km to dropoff`;
      } else {
        formattedDistance = `${distanceToDropoff.toFixed(0)} m to dropoff`;
      }
    }

    let message = "";

    switch (status) {
      case "accepted":
        message = `✅ <strong>Accepted!</strong> Driver is <strong>${formattedDistance}</strong> away.`;
        break;
      case "picked":
        message = `🟢 <strong>Picked Up!</strong> Dropoff is <strong>${formattedDistance}</strong> away.`;
        break;
      case "dropped":
        message = `🏁 <strong>Trip Complete!</strong>`;
        // Clear active booking status
        activeBooking = null;
        break;
      default:
        message = `🚗 Status: ${status.toUpperCase()}.`;
    }

    passengerMsg.innerHTML = message;

    // Update the local active booking status to reflect the change
    activeBooking.status = status;

    // If the status is final, refresh the list immediately
    if (status === "dropped" || status === "rejected") {
      refreshBookingsList();
      // Clear markers after trip completion
      if (pickupMarker) map.removeLayer(pickupMarker);
      if (dropMarker) map.removeLayer(dropMarker);
      pickupMarker = null;
      dropMarker = null;
      bookBtn.disabled = true;
    }
  }
});

/* ========== Passenger: Receive booking status updates (Initial Status Change) ========== */
socket.on("booking-status", (booking) => {
  if (currentUser && currentUser.role === "passenger") {
    // If this is the active booking, update its status
    if (activeBooking && activeBooking.id === booking.id) {
      activeBooking.status = booking.status;
    }

    let statusText = booking.status.toUpperCase();
    let displayMessage = "";

    switch (statusText) {
      case "PENDING":
        displayMessage = `⏳ Booking **PENDING**...`;
        break;
      case "ACCEPTED":
        displayMessage = `✅ Booking **ACCEPTED**!`;
        // Real-time tracking will take over from here
        break;
      case "REJECTED":
        displayMessage = `❌ Booking **REJECTED**.`;
        activeBooking = null;
        // Clear markers after rejection
        if (pickupMarker) map.removeLayer(pickupMarker);
        if (dropMarker) map.removeLayer(dropMarker);
        pickupMarker = null;
        dropMarker = null;
        bookBtn.disabled = true;
        break;
      case "PICKED":
        // Should be handled by real-time update, but for fallback:
        displayMessage = `🟢 Status: **PICKED UP**`;
        break;
      case "DROPPED":
        // Should be handled by real-time update, but for fallback:
        displayMessage = `🏁 Status: **COMPLETE**`;
        activeBooking = null;
        break;
      default:
        displayMessage = `🚗 Status: ${statusText}`;
    }

    passengerMsg.innerHTML = displayMessage;
    console.log(`Booking Status Update: ${statusText}`);
    refreshBookingsList();
  }
});

/* initial refresh */
setInterval(() => loadRoutes(), 15000); // refresh routes occasionally

// Initial render
renderUserUI();

// ============================================
// Multimodal Route Finder JavaScript
// ============================================

// Global Map Variables
let map = null;
let startMarker = null;
let endMarker = null;
let routingControl = null;
let clickForLocationType = null; // 'start' or 'end'
let currentClickedLocation = null; // Stores last location clicked on map

// API Configuration
// FIX: Removed const declaration. API_BASE_URL is provided globally by js/auth.js
// const API_BASE_URL = window.API_BASE_URL;

// DOM Elements
const startLocationInput = document.getElementById("startLocationInput");
const endLocationInput = document.getElementById("endLocationInput");
const startLatInput = document.getElementById("startLat");
const startLngInput = document.getElementById("startLng");
const endLatInput = document.getElementById("endLat");
const endLngInput = document.getElementById("endLng");
const findRouteBtn = document.getElementById("findRouteBtn");
const resetBtn = document.getElementById("resetBtn");
const routeCardsContainer = document.getElementById("routeCardsContainer");
const routeLoading = document.getElementById("routeLoading");
const noResultsMessage = document.getElementById("noResultsMessage");
const startLocationError = document.getElementById("startLocationError");
const endLocationError = document.getElementById("endLocationError");

// ============================================
// Page Initialization
// ============================================
document.addEventListener("DOMContentLoaded", function () {
  // Check if user is logged in
  if (!requireAuth()) {
    return;
  }

  initMap();
  setupEventListeners();

  // Load last search from session storage if available
  loadLastSearch();
});

// ============================================
// Map Initialization
// ============================================
function initMap() {
  // Default center: Bandra, Mumbai
  const mumbaiCenter = [19.076, 72.8777];

  map = L.map("mapContainer").setView(mumbaiCenter, 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  // Set default marker icon
  if (typeof L !== "undefined") {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }

  // Handle map click for location selection
  map.on("click", onMapClick);
}

// ============================================
// Event Listeners Setup
// ============================================
function setupEventListeners() {
  findRouteBtn.addEventListener("click", handleFindRoute);
  resetBtn.addEventListener("click", handleReset);
  document
    .getElementById("pickStartOnMapBtn")
    .addEventListener("click", () => startMapSelection("start"));
  document
    .getElementById("pickEndOnMapBtn")
    .addEventListener("click", () => startMapSelection("end"));

  // Geocoding Autocomplete for inputs
  setupGeocoding(startLocationInput, "start");
  setupGeocoding(endLocationInput, "end");

  // Input listeners to enable search on enter and clear errors
  startLocationInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleFindRoute();
    }
    clearErrorMessage("start");
  });
  endLocationInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleFindRoute();
    }
    clearErrorMessage("end");
  });
}

// ============================================
// Geocoding Setup (Nominatim Autocomplete)
// ============================================
function setupGeocoding(inputElement, locationType) {
  // 1. Create suggestions container
  const suggestionList = document.createElement("ul");
  suggestionList.className = `location-suggestions-${locationType}`;
  // Inject styles for the dropdown list
  suggestionList.style.cssText = `
        position: absolute; 
        top: 100%; 
        left: 0; 
        right: 0; 
        z-index: 10; 
        background: white; 
        border: 1px solid #ddd; 
        border-top: none;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        max-height: 200px;
        overflow-y: auto;
        list-style: none;
        padding: 0;
        margin: 0;
        border-radius: 0 0 8px 8px;
        display: none; /* Hidden by default */
    `;

  // Find the parent form-group div and append the suggestion list
  const parentFormGroup = inputElement.closest(".form-group");
  if (parentFormGroup) {
    parentFormGroup.style.position = "relative"; // Ensure absolute positioning works
    parentFormGroup.appendChild(suggestionList);
  }

  let debounceTimer;
  inputElement.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const query = inputElement.value.trim();

    // Clear suggestions if input is empty or too short
    if (query.length < 3) {
      suggestionList.style.display = "none";
      suggestionList.innerHTML = "";
      return;
    }

    debounceTimer = setTimeout(() => {
      fetchNominatim(query, locationType, suggestionList);
    }, 500);
  });

  // Hide suggestions when input loses focus (with a slight delay to allow click)
  inputElement.addEventListener("blur", () => {
    // Use a slight delay to allow the click handler on the suggestion to fire first
    setTimeout(() => {
      suggestionList.style.display = "none";
      suggestionList.innerHTML = "";
    }, 200);
  });
}

async function fetchNominatim(query, locationType, suggestionList) {
  try {
    // Restrict search to India (bbox around Mumbai for better results)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&limit=5&countrycodes=in&viewbox=72.7,18.8,73.1,19.3`;
    const response = await fetch(url, {
      headers: { "User-Agent": "ShareRickshaw App (route finder)" },
    });
    const data = await response.json();

    // Render all results as suggestions instead of selecting the first one
    renderSuggestions(data, locationType, suggestionList);
  } catch (error) {
    console.error("Nominatim search failed:", error);
    suggestionList.innerHTML = `<li style="padding: 10px; color: #d32f2f;">Search failed.</li>`;
    suggestionList.style.display = "block";
  }
}

function renderSuggestions(results, locationType, suggestionList) {
  suggestionList.innerHTML = ""; // Clear previous suggestions

  if (results.length === 0) {
    suggestionList.style.display = "none";
    return;
  }

  suggestionList.style.display = "block";

  results.forEach((result) => {
    const item = document.createElement("li");
    item.textContent = result.display_name;
    item.style.cssText = `
            padding: 10px; 
            cursor: pointer; 
            border-bottom: 1px solid #eee; 
            font-size: 14px;
        `;

    item.addEventListener("mouseover", () => {
      item.style.background = "#f0f7ff";
    });
    item.addEventListener("mouseout", () => {
      item.style.background = "white";
    });

    // Click handler to select the location
    item.addEventListener("click", () => {
      // FIX: Ensure coordinates are passed as Floats here
      selectSuggestion(
        parseFloat(result.lat),
        parseFloat(result.lon),
        result.display_name,
        locationType
      );
    });

    suggestionList.appendChild(item);
  });
}

function selectSuggestion(lat, lng, name, locationType) {
  // FIX: Get the target input element explicitly to ensure correct assignment
  const inputElement =
    locationType === "start" ? startLocationInput : endLocationInput;
  inputElement.value = name; // Update the display value

  // Ensure coordinates are updated immediately
  // Passing true here forces the input update which helps guarantee data sync.
  // FIX: Removed the 'true' parameter here to prevent double marking and rely solely on the explicit setters below.
  updateLocationData(lat, lng, name, locationType, false);

  // Clear suggestions immediately after selection
  const parentFormGroup = inputElement.closest(".form-group");
  const suggestionList = parentFormGroup.querySelector(
    `.location-suggestions-${locationType}`
  );
  if (suggestionList) {
    suggestionList.innerHTML = "";
    suggestionList.style.display = "none";
  }
}

// ============================================
// Map Click Handling
// ============================================

function startMapSelection(locationType) {
  clickForLocationType = locationType;
  map.getContainer().style.cursor = "crosshair";
  showNotification(
    `Click on the map to select your ${locationType} location.`,
    "info"
  );
}

function onMapClick(e) {
  if (clickForLocationType) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    // Reverse geocode to get a readable name for the input field
    window.locationService
      .reverseGeocode(lat, lng)
      .then((addressData) => {
        const name =
          addressData?.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        updateLocationData(lat, lng, name, clickForLocationType, true);
      })
      .catch(() => {
        const name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        updateLocationData(lat, lng, name, clickForLocationType, true);
      });

    clickForLocationType = null;
    map.getContainer().style.cursor = "";
  }
}

// ============================================
// Location Data Update & Marker Management
// ============================================
function updateLocationData(
  lat,
  lng,
  name,
  locationType,
  shouldUpdateInput = false
) {
  clearErrorMessage(locationType);

  // FIX: Use explicit references and assignment for local variables to ensure correctness
  let latInput, lngInput, nameInput;

  if (locationType === "start") {
    latInput = startLatInput;
    lngInput = startLngInput;
    nameInput = startLocationInput;

    // Remove old marker
    if (startMarker) {
      map.removeLayer(startMarker);
    }
  } else {
    latInput = endLatInput;
    lngInput = endLngInput;
    nameInput = endLocationInput;

    // Remove old marker
    if (endMarker) {
      map.removeLayer(endMarker);
    }
  }

  // 1. Update Hidden Coordinates
  latInput.value = lat;
  lngInput.value = lng;

  // 2. Update Input Field (if triggered by map click or successful geocoding)
  if (shouldUpdateInput) {
    nameInput.value = name;
  }

  // 3. Create NEW Marker
  // Define icon based on location type
  const iconUrl =
    locationType === "start"
      ? "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png"
      : "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png";

  const customIcon = L.icon({
    iconUrl: iconUrl,
    iconRetinaUrl: iconUrl.replace(".png", "-2x.png"),
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const marker = L.marker([lat, lng], { icon: customIcon })
    .addTo(map)
    .bindPopup(`<b>${locationType === "start" ? "Start" : "End"}:</b> ${name}`)
    .openPopup();

  // 4. Update Global Marker Reference
  if (locationType === "start") {
    startMarker = marker;
  } else {
    endMarker = marker;
  }

  // Adjust map view to include the new marker
  if (startMarker && endMarker) {
    const group = new L.featureGroup([startMarker, endMarker]);
    map.fitBounds(group.getBounds(), { padding: [50, 50] });
  } else {
    map.panTo([lat, lng]);
  }
}

// ============================================
// Handle Find Route (Main Function)
// ============================================
async function handleFindRoute() {
  clearAllErrors();
  clearResults();

  const sLat = startLatInput.value;
  const sLng = startLngInput.value;
  const eLat = endLatInput.value;
  const eLng = endLngInput.value;

  // Simple validation check for coordinates
  let hasError = false;

  // Check if coordinates are set AND the input text is not empty (for user clarity)
  if (!sLat || !sLng || startLocationInput.value.trim() === "") {
    showErrorMessage("start", "Please select a valid start location.");
    hasError = true;
  }
  if (!eLat || !eLng || endLocationInput.value.trim() === "") {
    showErrorMessage("end", "Please select a valid end location.");
    hasError = true;
  }

  if (hasError) return;

  // Save current search to session storage
  saveLastSearch();

  // Show loading state
  setLoading(true);

  try {
    const token = window.getToken();

    const response = await fetch(`${window.API_BASE_URL}/routes/multimodal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        startLat: sLat,
        startLng: sLng,
        endLat: eLat,
        endLng: eLng,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      // Check for the specific backend error (Issue #2)
      if (
        data.message &&
        data.message.includes(
          "Cannot read properties of undefined (reading 'stands')"
        )
      ) {
        throw new Error(
          "Failed to find multimodal routes: Backend setup incomplete. Please check the backend route controller."
        );
      }
      throw new Error(data.message || "Failed to find routes.");
    }

    displayRoutes(data.routes, sLat, sLng, eLat, eLng);
  } catch (error) {
    console.error("Multimodal route search error:", error);
    // Display a friendlier message for the backend error
    const errorMessage = error.message.includes("Backend setup incomplete")
      ? error.message
      : "A network error occurred. Please check your connection and ensure the backend is running.";

    noResultsMessage.textContent = errorMessage;
    noResultsMessage.style.display = "block";
  } finally {
    setLoading(false);
  }
}

// ============================================
// Display Routes & Map Integration
// ============================================
function displayRoutes(routes, sLat, sLng, eLat, eLng) {
  routeCardsContainer.innerHTML = "";
  noResultsMessage.style.display = "none";

  if (!routes || routes.length === 0) {
    noResultsMessage.textContent = "No suitable routes found for this journey.";
    noResultsMessage.style.display = "block";
    return;
  }

  routes.forEach((route, index) => {
    const card = createRouteCard(route, index);
    routeCardsContainer.appendChild(card);

    // Add click listener to plot route on map
    card.addEventListener("click", () => {
      // Clear previous OSRM route
      if (routingControl) {
        map.removeControl(routingControl);
      }

      // Plot the Direct Auto Route (Option 1) using Leaflet Routing Machine / OSRM
      if (route.type.includes("Direct Auto")) {
        plotDirectOsrmRoute(sLat, sLng, eLat, eLng, route.lineColor);
      } else {
        // Plot multimodal routes as simple polyline for visualization
        plotMultimodalPolyline(
          sLat,
          sLng,
          eLat,
          eLng,
          route.lineColor,
          route.steps
        );
      }

      // Highlight selected card
      document
        .querySelectorAll(".route-option-card")
        .forEach((c) => c.classList.remove("active-route"));
      card.classList.add("active-route");
    });
  });

  // Automatically select and display the first route (if it exists)
  if (routeCardsContainer.firstChild) {
    routeCardsContainer.firstChild.click();
  }
}

function createRouteCard(route, index) {
  const card = document.createElement("div");
  card.className = `route-option-card ${route.type
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace("(", "")
    .replace(")", "")}`;

  const cost =
    route.estimatedCostRupees !== "N/A"
      ? `₹${route.estimatedCostRupees}`
      : "N/A";
  const time =
    route.totalTravelTimeMinutes !== "N/A"
      ? `${route.totalTravelTimeMinutes} mins`
      : "N/A";

  let stepsList =
    route.steps.length > 0
      ? route.steps
          .map((step) => {
            const icon = getStepIcon(step.mode);
            const duration = step.durationMinutes
              ? ` (${step.durationMinutes} min)`
              : "";
            return `<li class="route-step"><span class="route-step-icon">${icon}</span>${step.instruction}${duration}</li>`;
          })
          .join("")
      : `<li class="route-step">${route.routeDescription}</li>`;

  card.innerHTML = `
    <div class="route-option-header">
      <div class="route-option-title">${route.icon} ${route.type}</div>
      <div class="route-summary-cost">${cost}</div>
    </div>
    <div class="route-option-details">
      <span class="route-summary-time">${time}</span> | ${route.routeDescription}
    </div>
    <ul class="route-steps-list">
      ${stepsList}
    </ul>
  `;
  return card;
}

function getStepIcon(mode) {
  switch (mode) {
    case "WALK":
      return "🚶";
    case "TRAIN":
      return "🚆";
    case "SHARED_AUTO":
      return "🛺";
    case "AUTO":
      return "🚗";
    default:
      return "📍";
  }
}

function plotDirectOsrmRoute(sLat, sLng, eLat, eLng, lineColor) {
  if (typeof L.Routing === "undefined") {
    showError("Leaflet Routing Machine not loaded. Cannot plot route.");
    return;
  }

  // Clear existing routing control
  if (routingControl) {
    map.removeControl(routingControl);
  }

  // Define custom waypoint markers (default markers are used by updateLocationData)
  const createMarker = (i, wp) => {
    const iconUrl =
      i === 0
        ? "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png"
        : "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png";

    const customIcon = L.icon({
      iconUrl: iconUrl,
      iconRetinaUrl: iconUrl.replace(".png", "-2x.png"),
      shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    return L.marker(wp.latLng, {
      icon: customIcon,
      draggable: false,
    })
      .bindPopup(i === 0 ? "Start" : "End")
      .openPopup();
  };

  // Create routing control using OSRM
  routingControl = L.Routing.control({
    waypoints: [L.latLng(sLat, sLng), L.latLng(eLat, eLng)],
    router: L.Routing.osrmv1({
      serviceUrl: "https://router.project-osrm.org/route/v1",
    }),
    routeWhileDragging: false,
    show: true,
    collapsed: false,
    position: "topleft",
    lineOptions: {
      styles: [{ color: lineColor || "#1976d2", weight: 6, opacity: 0.8 }],
    },
    // We already have the markers from updateLocationData, so we use a custom marker creator that only creates the initial waypoints
    // when the routing is initiated, and then removes them (optional, tricky with manual markers, so we just let it create a clean route).
    // For this implementation, let's keep the existing markers and just draw the line over them.
    createMarker: function () {
      return null;
    },
    fitSelectedRoutes: "smart",
  }).addTo(map);
}

function plotMultimodalPolyline(sLat, sLng, eLat, eLng, lineColor) {
  // Clear existing routing control/line
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }

  // Since we don't have intermediate coordinates for the multimodal steps (train/shared auto),
  // we draw a simple dashed polyline connecting start and end to visualize the concept.
  const polyline = L.polyline(
    [
      [sLat, sLng],
      [eLat, eLng],
    ],
    {
      color: lineColor || "#1976d2",
      weight: 5,
      opacity: 0.7,
      dashArray: "10, 10", // Dashed line to show it's a conceptual route
    }
  ).addTo(map);

  // Zoom to fit the new line
  map.fitBounds(polyline.getBounds(), { padding: [50, 50] });

  // Store polyline reference in routingControl variable for cleanup
  routingControl = {
    removeControl: () => {
      map.removeLayer(polyline);
      if (routingControl && routingControl.directionsContainer) {
        routingControl.directionsContainer.remove();
      }
    },
  };
}

// ============================================
// Reset and Utility Functions
// ============================================

function handleReset() {
  // Clear map markers and route line
  if (startMarker) map.removeLayer(startMarker);
  if (endMarker) map.removeLayer(endMarker);
  if (routingControl) map.removeControl(routingControl);

  startMarker = null;
  endMarker = null;
  routingControl = null;

  // Clear input fields and hidden coordinates
  document.getElementById("routeFinderForm").reset();
  startLatInput.value = "";
  startLngInput.value = "";
  endLatInput.value = "";
  endLngInput.value = "";

  // Clear errors and results
  clearAllErrors();
  clearResults();

  // Clear session storage
  sessionStorage.removeItem("lastSearch");

  // Reset map view to Mumbai center
  map.setView([19.076, 72.8777], 12);
}

function clearResults() {
  routeCardsContainer.innerHTML = "";
  noResultsMessage.style.display = "none";
  routeLoading.style.display = "block";

  // Clear previous OSRM route if exists
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
}

function clearAllErrors() {
  startLocationError.classList.remove("show");
  endLocationError.classList.remove("show");
}

function showErrorMessage(field, message) {
  if (field === "start") {
    startLocationError.textContent = message;
    startLocationError.classList.add("show");
  } else if (field === "end") {
    endLocationError.textContent = message;
    endLocationError.classList.add("show");
  }
}

function clearErrorMessage(field) {
  if (field === "start") {
    startLocationError.classList.remove("show");
  } else if (field === "end") {
    endLocationError.classList.remove("show");
  }
}

function setLoading(isLoading) {
  if (isLoading) {
    routeLoading.innerHTML = `
        <div class="spinner-overlay" style="position: relative; height: 100px; padding: 0;">
            <div class="spinner"></div>
            <p>Finding the best multimodal routes... </p>
        </div>
    `;
    routeLoading.style.display = "block";
    findRouteBtn.disabled = true;
    findRouteBtn.textContent = "Searching...";
  } else {
    routeLoading.style.display = "none";
    findRouteBtn.disabled = false;
    findRouteBtn.textContent = "Find Routes";
  }
}

function showNotification(message, type = "info") {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // Implement a proper toast notification system here if needed
}

function saveLastSearch() {
  const searchData = {
    startName: startLocationInput.value,
    endName: endLocationInput.value,
    startLat: startLatInput.value,
    startLng: startLngInput.value,
    endLat: endLatInput.value,
    endLng: endLngInput.value,
  };
  sessionStorage.setItem("lastSearch", JSON.stringify(searchData));
}

function loadLastSearch() {
  const searchDataJson = sessionStorage.getItem("lastSearch");
  if (searchDataJson) {
    const data = JSON.parse(searchDataJson);

    startLocationInput.value = data.startName;
    endLocationInput.value = data.endName;

    if (data.startLat && data.startLng) {
      updateLocationData(
        data.startLat,
        data.startLng,
        data.startName,
        "start",
        false
      );
    }
    if (data.endLat && data.endLng) {
      updateLocationData(data.endLat, data.endLng, data.endName, "end", false);
    }

    // Auto-run search if both locations are set
    if (data.startLat && data.endLat) {
      handleFindRoute();
    }
  }
}
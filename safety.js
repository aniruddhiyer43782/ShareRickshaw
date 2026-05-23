// Safety Features JavaScript
document.addEventListener("DOMContentLoaded", function () {
  if (!requireAuth()) return;

  // ========================================
  // GLOBAL VARIABLES
  // ========================================
  let nightModeInterval = null;
  const TRACKING_INTERVAL_MS = 120000;
  const API_BASE_URL = window.API_BASE_URL;
  let nightModePlate = null;
  let isNightModeCapture = false;

  // ========================================
  // DOM ELEMENT REFERENCES
  // ========================================
  const sosButton = document.getElementById("sosButton");
  const sosModal = document.getElementById("sosModal");
  const modalCancel = document.getElementById("modalCancel");
  const modalConfirm = document.getElementById("modalConfirm");
  const sosLocation = document.getElementById("sosLocation");
  const sosSuccess = document.getElementById("sosSuccess");
  const sosError = document.getElementById("sosError");

  const uploadButton = document.getElementById("uploadButton");
  const fileInputCamera = document.getElementById("fileInputCamera");
  const fileInputGallery = document.getElementById("fileInputGallery");
  const previewArea = document.getElementById("previewArea");
  const extractedPlate = document.getElementById("extractedPlate");
  const photoTimestamp = document.getElementById("photoTimestamp");
  const photoLocation = document.getElementById("photoLocation");
  const uploadError = document.getElementById("uploadError");
  const captureSuccess = document.getElementById("captureSuccess");

  const captureSourceModal = document.getElementById("captureSourceModal");
  const selectCameraBtn = document.getElementById("selectCameraBtn");
  const selectGalleryBtn = document.getElementById("selectGalleryBtn");
  const closeCaptureSourceModalBtn = document.getElementById("closeCaptureSourceModal");

  const nightModeCard = document.getElementById("nightModeCard");
  const nightModeToggle = document.getElementById("nightModeToggle");
  const nightModeStatus = document.getElementById("nightModeStatus");
  const nightModeCoords = document.getElementById("nightModeCoords");
  const nightModeLocation = document.getElementById("nightModeLocation");
  const nightModeTimestamp = document.getElementById("nightModeTimestamp");
  const nightModeError = document.getElementById("nightModeError");
  const nightModePlateDisplay = document.getElementById("nightModePlateDisplay");

  const historyList = document.getElementById("captureHistoryList");
  const historyLoading = document.getElementById("historyLoading");
  const noHistoryMessage = document.getElementById("noHistoryMessage");

  // ========================================
  // INITIALIZATION
  // ========================================
  loadCaptureHistory();
  initializeNightMode();

  // ========================================
  // EVENT LISTENERS
  // ========================================
  if (sosButton) sosButton.addEventListener("click", handleSosButton);
  if (modalCancel) modalCancel.addEventListener("click", () => sosModal.classList.remove("show"));

  if (modalConfirm) {
    modalConfirm.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      handleConfirmSos();
    });
  }

  if (uploadButton) uploadButton.addEventListener("click", () => openCaptureSourceModal(false));
  if (selectCameraBtn)
    selectCameraBtn.addEventListener("click", () => {
      closeCaptureSourceModal();
      fileInputCamera.value = "";
      fileInputCamera.click();
    });
  if (selectGalleryBtn)
    selectGalleryBtn.addEventListener("click", () => {
      closeCaptureSourceModal();
      fileInputGallery.value = "";
      fileInputGallery.click();
    });
  if (closeCaptureSourceModalBtn) closeCaptureSourceModalBtn.addEventListener("click", closeCaptureSourceModal);
  if (fileInputCamera) fileInputCamera.addEventListener("change", handleFileSelect);
  if (fileInputGallery) fileInputGallery.addEventListener("change", handleFileSelect);
  if (nightModeToggle) nightModeToggle.addEventListener("click", toggleNightMode);

  // ========================================
  // SOS HANDLERS
  // ========================================
  function handleSosButton() {
    if (!sosModal) return console.error("SOS modal missing.");
    sosSuccess?.classList.add("hidden");
    sosError?.classList.add("hidden");
    sosModal.classList.add("show");

    const coordText = sosLocation?.querySelector(".coords");
    if (coordText) coordText.textContent = "Fetching location...";

    locationService
      .getCurrentLocation()
      .then(({ latitude, longitude }) => {
        if (coordText)
          coordText.textContent = `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`;
      })
      .catch((err) => {
        if (coordText) coordText.textContent = `Error: ${err.message}`;
        console.error("SOS location error:", err);
      });
  }

  async function handleConfirmSos() {
    if (!sosModal || !sosButton || !sosError || !sosSuccess) {
      console.error("Missing SOS DOM elements");
      return;
    }

    sosModal.classList.remove("show");
    sosButton.disabled = true;
    sosButton.textContent = "Sending SOS...";
    sosError.classList.add("hidden");

    let lat = 0, lng = 0, accuracy = 0;

    try {
      const loc = await locationService.captureSOSLocation();
      lat = loc.latitude;
      lng = loc.longitude;
      accuracy = loc.accuracy;
    } catch (e) {
      console.warn("Location fetch failed:", e.message);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/safety/sos/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ location: { latitude: lat, longitude: lng, accuracy } }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        sosError.textContent = data.message || "Failed to trigger SOS.";
        sosError.classList.remove("hidden");
        return;
      }

      sosSuccess.querySelector("p")?.textContent || "SOS alert sent!";
      sosSuccess.classList.remove("hidden");
      const coordText = sosLocation?.querySelector(".coords");
      if (coordText) coordText.textContent = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
      showNotification("SOS triggered!", "danger");
    } catch (error) {
      console.error("SOS trigger error:", error);
      sosError.textContent = "Unable to connect to safety server.";
      sosError.classList.remove("hidden");
    } finally {
      sosButton.disabled = false;
      sosButton.textContent = "🚨 SOS EMERGENCY 🚨";
    }
  }

  // ========================================
  // CAPTURE + NIGHT MODE + HISTORY
  // ========================================
  function openCaptureSourceModal(isNightMode) {
    if (!captureSourceModal) return;
    isNightModeCapture = isNightMode;
    captureSourceModal.classList.remove("hidden");
    captureSourceModal.classList.add("show");
  }

  function closeCaptureSourceModal() {
    if (!captureSourceModal) return;
    if (isNightModeCapture) {
      nightModePlate = null;
      startTrackingInterval();
      showNightModeError("Plate capture skipped. Tracking only.");
    }
    isNightModeCapture = false;
    captureSourceModal.classList.remove("show");
    captureSourceModal.classList.add("hidden");
  }

  function clearCaptureMessages() {
    uploadError.classList.add("hidden");
    captureSuccess.classList.add("hidden");
    extractedPlate.textContent = "---";
    photoTimestamp.textContent = "---";
    photoLocation.textContent = "---";
    document.getElementById("photoMetadata").classList.add("hidden");
  }

  function displayImagePreview(dataURL) {
    previewArea.innerHTML = "";
    const img = document.createElement("img");
    img.src = dataURL;
    previewArea.appendChild(img);
  }

  async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    clearCaptureMessages();
    uploadButton.disabled = true;
    uploadButton.textContent = "Processing...";

    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      uploadError.textContent = "Invalid file. Please upload under 5MB.";
      uploadError.classList.remove("hidden");
      uploadButton.disabled = false;
      uploadButton.textContent = "📷 Capture/Upload Plate Photo";
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUri = e.target.result;
      const base64Image = dataUri.split(",")[1];
      try {
        const location = await locationService.getCurrentLocation();
        const { latitude, longitude } = location;
        const res = await fetch(`${API_BASE_URL}/safety/capture-auto`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ imageBase64: base64Image, latitude, longitude }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Capture failed.");
        const plate = data.data.license_plate;
        displayImagePreview(dataUri);
        extractedPlate.textContent = plate;
        photoTimestamp.textContent = formatDateTime(new Date());
        photoLocation.textContent = `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`;
        document.getElementById("photoMetadata").classList.remove("hidden");
        captureSuccess.classList.remove("hidden");
        loadCaptureHistory();
      } catch (err) {
        uploadError.textContent = "AI processing failed. Try again.";
        uploadError.classList.remove("hidden");
        console.error(err);
      } finally {
        uploadButton.disabled = false;
        uploadButton.textContent = "📷 Capture/Upload Plate Photo";
      }
    };
    reader.readAsDataURL(file);
  }

  // ========================================
  // NIGHT MODE (Fixed + Improved)
  // ========================================
  function initializeNightMode() {
    stopNightMode(false);
    nightModeStatus.textContent = "Night Mode allows live tracking. Toggle ON to start.";
    nightModeStatus.style.background = "#e3f2fd";
    nightModeStatus.style.color = "#1565c0";
  }

function toggleNightMode() {
  nightModeToggle.classList.toggle("active");

  const isActive = nightModeToggle.classList.contains("active");

  if (isActive) {
      startNightMode();
      nightModeStatus.textContent = "Night Mode Tracking is ON — your location is being updated.";
  } else {
      stopNightMode();
      nightModeStatus.textContent = "Night Mode allows live tracking. Toggle ON to start.";
  }
}

  async function startNightMode() {
    nightModeToggle.classList.add("active");
    nightModeStatus.textContent = "✓ Night mode active — Initializing...";
    nightModeStatus.style.background = "#e8f5e9";
    nightModeStatus.style.color = "#2e7d32";

    // ✅ Immediately send first update + email
    await sendLocationUpdateToBackend();
    startTrackingInterval();
  }

  function stopNightMode(resetUI = true) {
    if (nightModeInterval) clearInterval(nightModeInterval);
    if (resetUI) {
      nightModeToggle.classList.remove("active");
      nightModeStatus.textContent = "Night Mode is OFF.";
      nightModeStatus.style.background = "#ffebee";
      nightModeStatus.style.color = "#d32f2f";
      nightModeCoords.classList.add("hidden");
    }
  }

  async function startTrackingInterval() {
    await sendLocationUpdateToBackend();
    nightModeInterval = setInterval(sendLocationUpdateToBackend, TRACKING_INTERVAL_MS);
  }

  async function sendLocationUpdateToBackend() {
    nightModeLocation.textContent = "Fetching location...";
    try {
      const loc = await locationService.getCurrentLocation();
      const { latitude, longitude } = loc;

      const res = await fetch(`${API_BASE_URL}/safety/night-track/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          location: { latitude, longitude },
          autoNumber: nightModePlate || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        nightModeError.textContent = data.message || "Failed to send tracking update.";
        nightModeError.classList.remove("hidden");
        return;
      }

      nightModeLocation.textContent = `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`;
      nightModeTimestamp.textContent = "Updated: " + formatTimestamp(new Date());
      console.log("Night tracking update success:", data.message);
    } catch (err) {
      console.error("Night tracking update error:", err);
      nightModeError.textContent = "Network error during tracking update.";
      nightModeError.classList.remove("hidden");
    }
  }

  // ========================================
  // HISTORY
  // ========================================
  async function loadCaptureHistory() {
    historyLoading.style.display = "block";
    noHistoryMessage.style.display = "none";
    historyList.innerHTML = "";
    try {
      const res = await fetch(`${API_BASE_URL}/safety/capture-history`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      historyLoading.style.display = "none";
      if (!res.ok || !data.success || !data.history.length) {
        noHistoryMessage.style.display = "block";
        return;
      }
      data.history.forEach((item) => {
        const card = document.createElement("div");
        card.className = "history-card";
        const date = new Date(item.captured_at);
        card.innerHTML = `
          <div class="history-details">
            <div class="history-plate">${item.license_plate}</div>
            <div class="history-location">📍 ${item.location}</div>
            <div class="history-time">🕒 ${date.toLocaleString()}</div>
          </div>`;
        historyList.appendChild(card);
      });
    } catch {
      historyLoading.textContent = "Error loading history.";
    }
  }

  // ========================================
  // UTILITIES
  // ========================================
  function showNotification(msg, type) {
    console.log(`[${type.toUpperCase()}] ${msg}`);
  }

  function formatDateTime(d) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1
    ).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }

  function formatTimestamp(d) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(
      2,
      "0"
    )}:${String(d.getSeconds()).padStart(2, "0")}`;
  }

  // ✅ Global SOS for floating button
  window.handleSosButton = handleSosButton;
});

document.addEventListener("DOMContentLoaded", () => {
  const sosButton = document.getElementById("globalSosButton");

  if (!sosButton) return;

  sosButton.addEventListener("click", async () => {
    // Show visual feedback inside the circle
    sosButton.innerHTML = `<span style="font-size:13px;color:black;font-weight:600;text-align:center;">SOS Sending...</span>`;

    try {
      // 1. Get location
      let position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 7000,
        });
      });

      const { latitude, longitude } = position.coords;

      // 2. Send SOS request to backend (same endpoint as Safety page)
      const response = await fetch("http://localhost:3000/api/safety/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude }),
      });

      const result = await response.json();

      // 3. Handle response
      if (result.success) {
        console.log("✅ SOS alert sent successfully!");
      } else {
        console.warn("⚠️ SOS alert failed:", result.message || "Unknown error");
      }
    } catch (err) {
      console.error("❌ SOS error:", err);
    } finally {
      // Revert button after 2 seconds
      setTimeout(() => {
        sosButton.innerHTML = "🚨";
      }, 1800);
    }
  });
});

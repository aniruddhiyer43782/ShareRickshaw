document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;

  const user = getUserData();

  // HARD FIX: in case userData stored incorrectly earlier
  if (!user || !user.role) {
    window.location.href = "login.html";
    return;
  }

  // Only autowala allowed
  if (user.role !== "autowala") {
    window.location.href = "index.html";
    return;
  }

  const token = getToken();
  const API = window.API_BASE_URL;

  try {
    const res = await fetch(`${API}/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();

    if (!data.success) throw new Error(data.message);

    const d = data.user;

    document.getElementById("driverName").textContent = d.driver_name || "Driver";
    document.getElementById("licensePlate").textContent = d.license_plate || "N/A";
    document.getElementById("driverPhone").textContent = d.phone_number || "N/A";
    document.getElementById("operatingLocation").textContent = d.operating_location || "Not set";

  } catch (err) {
    console.error("Driver dashboard load error:", err);
    alert("Unable to load driver info");
  }
});


function getToken() {
  return localStorage.getItem("token");
}

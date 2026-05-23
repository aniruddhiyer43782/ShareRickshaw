// js/auth.js
// Unified Auth helpers used across pages

// API base - adjust only here if your backend URL changes
window.API_BASE_URL = window.API_BASE_URL || "http://localhost:3000/api";

// Remove any old legacy token key if present
try { localStorage.removeItem("authToken"); } catch (e) { /* ignore */ }

// Get stored token
function getToken() {
  return localStorage.getItem("token");
}

// Get stored user details (parsed)
function getUserData() {
  try {
    return JSON.parse(localStorage.getItem("userData"));
  } catch (e) {
    return null;
  }
}

// Check login status
function isLoggedIn() {
  return !!getToken();
}

// Force login for protected pages
function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

// Logout handler
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("userData");
  window.location.href = "login.html";
}

// Update navbar links (element with id "nav-links")
function updateNavBar() {
  const navLinks = document.getElementById("nav-links");
  if (!navLinks) return;

  const user = getUserData();
  const role = user?.role;

  if (role === "autowala") {
    navLinks.innerHTML = `
      <a href="driver-dashboard.html">🚗 Dashboard</a>
      <a href="autowala-profile.html">👤 Profile</a>
      <a href="#" onclick="logout()">🚪 Logout</a>
    `;
  } else if (role === "user") {
    navLinks.innerHTML = `
      <a href="profile.html">👤 Profile</a>
      <a href="logout.html">🚪 Logout</a>
    `;
  } else {
    navLinks.innerHTML = `
      <a href="login.html">🔐 Login</a>
      <a href="signup.html">✍️ Sign Up</a>
    `;
  }
}

// Init navbar on DOM load
document.addEventListener("DOMContentLoaded", updateNavBar);

// Export globally
window.getToken = getToken;
window.getUserData = getUserData;
window.isLoggedIn = isLoggedIn;
window.requireAuth = requireAuth;
window.logout = logout;
window.updateNavBar = updateNavBar;

// js/signup-autowala.js
const API_BASE_URL = window.API_BASE_URL || "http://localhost:3000/api";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signup-form");
  const submitBtn = document.getElementById("submit-btn");
  const generalError = document.getElementById("general-error");

  // Form fields
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  const driverNameInput = document.getElementById("driver-name");
  const phoneInput = document.getElementById("phone");
  const locationInput = document.getElementById("location");
  const licensePlateInput = document.getElementById("license-plate");

  // Error elements
  const emailError = document.getElementById("email-error");
  const passwordError = document.getElementById("password-error");
  const confirmPasswordError = document.getElementById("confirm-password-error");
  const driverNameError = document.getElementById("driver-name-error");
  const phoneError = document.getElementById("phone-error");
  const locationError = document.getElementById("location-error");
  const licensePlateError = document.getElementById("license-plate-error");

  // Validation helpers (same rules you used)
  function validateEmail() {
    const email = emailInput.value.trim();
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) {
      emailInput.classList.add("error");
      emailError.classList.add("show");
      return false;
    }
    emailInput.classList.remove("error");
    emailError.classList.remove("show");
    return true;
  }

  function validatePassword() {
    const password = passwordInput.value;
    if (password.length < 6) {
      passwordInput.classList.add("error");
      passwordError.classList.add("show");
      return false;
    }
    passwordInput.classList.remove("error");
    passwordError.classList.remove("show");
    return true;
  }

  function validateConfirmPassword() {
    if (passwordInput.value !== confirmPasswordInput.value) {
      confirmPasswordInput.classList.add("error");
      confirmPasswordError.classList.add("show");
      return false;
    }
    confirmPasswordInput.classList.remove("error");
    confirmPasswordError.classList.remove("show");
    return true;
  }

  function validateDriverName() {
    const v = driverNameInput.value.trim();
    if (v.length < 2 || v.length > 100) {
      driverNameInput.classList.add("error");
      driverNameError.classList.add("show");
      return false;
    }
    driverNameInput.classList.remove("error");
    driverNameError.classList.remove("show");
    return true;
  }

  function validatePhone() {
    const v = phoneInput.value.trim();
    const regex = /^\d{10}$/;
    if (!regex.test(v)) {
      phoneInput.classList.add("error");
      phoneError.classList.add("show");
      return false;
    }
    phoneInput.classList.remove("error");
    phoneError.classList.remove("show");
    return true;
  }

  function validateLocation() {
    const v = locationInput.value.trim();
    if (v.length < 2 || v.length > 100) {
      locationInput.classList.add("error");
      locationError.classList.add("show");
      return false;
    }
    locationInput.classList.remove("error");
    locationError.classList.remove("show");
    return true;
  }

  function validateLicensePlate() {
    const v = licensePlateInput.value.trim().toUpperCase();
    const regex = /^[A-Z0-9]{5,20}$/;
    if (!regex.test(v)) {
      licensePlateInput.classList.add("error");
      licensePlateError.classList.add("show");
      return false;
    }
    licensePlateInput.classList.remove("error");
    licensePlateError.classList.remove("show");
    return true;
  }

  // Event listeners to clear errors
  [emailInput, passwordInput, confirmPasswordInput, driverNameInput, phoneInput, locationInput, licensePlateInput].forEach(el => {
    el?.addEventListener("input", () => {
      el.classList.remove("error");
      // hide corresponding error if exists
      const err = document.getElementById(el.id + "-error");
      if (err) err.classList.remove("show");
    });
  });

  licensePlateInput?.addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    generalError.classList.remove("show");

    const ok = validateEmail() && validatePassword() && validateConfirmPassword()
      && validateDriverName() && validatePhone() && validateLocation() && validateLicensePlate();

    if (!ok) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating Account...";

    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup-autowala`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value,
          driver_name: driverNameInput.value.trim(),
          phone_number: phoneInput.value.trim(),
          operating_location: locationInput.value.trim(),
          license_plate: licensePlateInput.value.trim().toUpperCase(),
          role: "autowala"
        }),
      });

      const data = await response.json();

      if (data.success) {
        // store under unified keys
        localStorage.setItem("token", data.token);
        localStorage.setItem("userData", JSON.stringify(data.user));

        window.location.href = "driver-dashboard.html";
      } else {
        generalError.textContent = data.message || "Something went wrong. Please try again.";
        generalError.classList.add("show");
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Autowala Account";
      }
    } catch (err) {
      console.error("Signup error:", err);
      generalError.textContent = "Unable to connect. Please try again.";
      generalError.classList.add("show");
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Autowala Account";
    }
  });
});

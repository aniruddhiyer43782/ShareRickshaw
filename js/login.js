// js/login.js
const API_BASE_URL = window.API_BASE_URL || "http://localhost:3000/api";

// Remove legacy key if exists
try { localStorage.removeItem("authToken"); } catch (e) { /* ignore */ }

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  const submitBtn = document.getElementById("submit-btn");
  const generalError = document.getElementById("general-error");

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  const emailError = document.getElementById("email-error");
  const passwordError = document.getElementById("password-error");

  function validateEmail() {
    const email = emailInput.value.trim();
    if (!email) {
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
    if (!password) {
      passwordInput.classList.add("error");
      passwordError.classList.add("show");
      return false;
    }
    passwordInput.classList.remove("error");
    passwordError.classList.remove("show");
    return true;
  }

  emailInput.addEventListener("blur", validateEmail);
  passwordInput.addEventListener("blur", validatePassword);

  emailInput.addEventListener("input", () => {
    emailInput.classList.remove("error");
    emailError.classList.remove("show");
    generalError.classList.remove("show");
  });

  passwordInput.addEventListener("input", () => {
    passwordInput.classList.remove("error");
    passwordError.classList.remove("show");
    generalError.classList.remove("show");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    generalError.classList.remove("show");

    const isEmailValid = validateEmail();
    const isPasswordValid = validatePassword();
    if (!isEmailValid || !isPasswordValid) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value
        })
      });

      const data = await response.json();

      if (data.success) {
        const cleanUser = {
          id: data.user.id,
          role: data.user.role || null,
          email: data.user.email || null,
          username: data.user.username || null,
          phone_number: data.user.phone_number || null,
          driver_name: data.user.driver_name || null,
          operating_location: data.user.operating_location || null,
          license_plate: data.user.license_plate || null
        };

        // Store token and userData under unified keys
        localStorage.setItem("token", data.token);
        localStorage.setItem("userData", JSON.stringify(cleanUser));

        // Redirect based on role
        if (cleanUser.role === "autowala") {
          window.location.href = "driver-dashboard.html";
        } else {
          window.location.href = "index.html";
        }
      } else {
        generalError.textContent = data.message || "Invalid email or password";
        generalError.classList.add("show");
        submitBtn.disabled = false;
        submitBtn.textContent = "Login";
      }
    } catch (error) {
      console.error("Login error:", error);
      generalError.textContent = "Unable to connect. Please try again.";
      generalError.classList.add("show");
      submitBtn.disabled = false;
      submitBtn.textContent = "Login";
    }
  });
});

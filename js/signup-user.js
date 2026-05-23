// js/signup-user.js
const API_BASE_URL = window.API_BASE_URL || "http://localhost:3000/api";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signup-form");
  const submitBtn = document.getElementById("submit-btn");
  const generalError = document.getElementById("general-error");

  const usernameInput = document.getElementById("username");
  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirm-password");

  // Add simple validation similar to earlier file
  function validateUsername() {
    const v = usernameInput.value.trim();
    const regex = /^[a-zA-Z0-9_]{3,50}$/;
    if (!regex.test(v)) { usernameInput.classList.add("error"); return false; }
    usernameInput.classList.remove("error"); return true;
  }

  function validateEmail() {
    const v = emailInput.value.trim();
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(v)) { emailInput.classList.add("error"); return false; }
    emailInput.classList.remove("error"); return true;
  }

  function validatePhone() {
    const v = phoneInput.value.trim();
    const regex = /^\d{10}$/;
    if (!regex.test(v)) { phoneInput.classList.add("error"); return false; }
    phoneInput.classList.remove("error"); return true;
  }

  function validatePassword() {
    if (passwordInput.value.length < 6) { passwordInput.classList.add("error"); return false; }
    passwordInput.classList.remove("error"); return true;
  }

  function validateConfirmPassword() {
    if (passwordInput.value !== confirmPasswordInput.value) { confirmPasswordInput.classList.add("error"); return false; }
    confirmPasswordInput.classList.remove("error"); return true;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    generalError.classList.remove("show");

    const ok = validateUsername() && validateEmail() && validatePhone() && validatePassword() && validateConfirmPassword();
    if (!ok) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating Account...";

    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: usernameInput.value.trim(),
          email: emailInput.value.trim(),
          phone_number: phoneInput.value.trim(),
          password: passwordInput.value,
          role: "user"
        })
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("userData", JSON.stringify(data.user));
        window.location.href = "index.html";
      } else {
        generalError.textContent = data.message || "Something went wrong.";
        generalError.classList.add("show");
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Account";
      }
    } catch (err) {
      console.error("Signup error:", err);
      generalError.textContent = "Unable to connect. Please try again.";
      generalError.classList.add("show");
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Account";
    }
  });
});

// js/profile.js
document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;

  const token = localStorage.getItem("token");
  const API_URL = window.API_BASE_URL || "http://localhost:3000/api";

  // DOM sections
  const userProfileSection = document.getElementById("user-profile-section");
  const autowalaProfileSection = document.getElementById("autowala-profile-section");
  const emergencyContactsSection = document.getElementById("emergency-contacts-section");

  try {
    const res = await fetch(`${API_URL}/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const user = data.user;

    if (user.role === "autowala" && autowalaProfileSection) {
      renderAutowalaProfile(user);
    } else if (user.role === "user" && userProfileSection) {
      renderUserProfile(user);
    }
  } catch (err) {
    console.error("Error loading profile:", err);
    alert("Failed to load profile. Please try again.");
  }

  // USER PROFILE RENDER
  function renderUserProfile(user) {
    userProfileSection?.classList.remove("hidden");
    emergencyContactsSection?.classList.remove("hidden");

    document.getElementById("display-username").value = user.username || "";
    document.getElementById("display-email").value = user.email || "";
    document.getElementById("user-phone").value = user.phone_number || "";

    setupUserProfileEvents();
  }

  // AUTOWALA PROFILE RENDER
  function renderAutowalaProfile(user) {
    autowalaProfileSection?.classList.remove("hidden");

    document.getElementById("autowala-email").textContent = user.email || "N/A";
    document.getElementById("autowala-driver-name").value = user.driver_name || "";
    document.getElementById("autowala-phone").value = user.phone_number || "";
    document.getElementById("autowala-location").value = user.operating_location || "";
    document.getElementById("autowala-license-plate").textContent = user.license_plate || "N/A";

    setupAutowalaProfileEvents();
  }

  // USER EVENTS
  function setupUserProfileEvents() {
    const updateBtn = document.getElementById("update-user-profile");
    const phoneInput = document.getElementById("user-phone");
    const usernameInput = document.getElementById("display-username");
    const emailInput = document.getElementById("display-email");

    const successMsg = document.getElementById("profile-success");
    const errorMsg = document.getElementById("profile-error");

    updateBtn?.addEventListener("click", async () => {
      const phone = phoneInput.value.trim();

      if (!/^\d{10}$/.test(phone)) {
        showError(errorMsg, "Phone number must be 10 digits");
        return;
      }

      const body = {
        username: usernameInput.value.trim(),
        email: emailInput.value.trim(),
        phone_number: phone
      };

      await updateProfile(body, successMsg, errorMsg, updateBtn);
    });
  }

  // AUTOWALA EVENTS
  function setupAutowalaProfileEvents() {
    const updateBtn = document.getElementById("update-autowala-profile");

    const driverName = document.getElementById("autowala-driver-name");
    const phone = document.getElementById("autowala-phone");
    const location = document.getElementById("autowala-location");

    const successMsg = document.getElementById("autowala-profile-success");
    const errorMsg = document.getElementById("autowala-profile-error");

    updateBtn?.addEventListener("click", async () => {
      const body = {
        driver_name: driverName.value.trim(),
        phone_number: phone.value.trim(),
        operating_location: location.value.trim()
      };

      if (body.phone_number && !/^\d{10}$/.test(body.phone_number)) {
        showError(errorMsg, "Phone number must be 10 digits");
        return;
      }

      await updateProfile(body, successMsg, errorMsg, updateBtn);
    });
  }

  // UNIVERSAL UPDATE FUNCTION
  async function updateProfile(body, successMsg, errorMsg, button) {
    button.disabled = true;
    button.textContent = "Updating...";

    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (data.success) showSuccess(successMsg, "Profile updated successfully");
      else showError(errorMsg, data.message);
    } catch (err) {
      showError(errorMsg, "Update failed");
    } finally {
      button.disabled = false;
      button.textContent = "Update Profile";
    }
  }
});

// GLOBAL SUCCESS / ERROR
window.showSuccess = function (el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.color = "green";
  el.style.display = "block";
  setTimeout(() => el.style.display = "none", 3000);
};

window.showError = function (el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.color = "red";
  el.style.display = "block";
  setTimeout(() => el.style.display = "none", 3000);
};


// ================================================================
// 🚨 EMERGENCY CONTACTS MODULE
// ================================================================
document.addEventListener("DOMContentLoaded", () => {

    const API_URL = window.API_BASE_URL || "http://localhost:3000/api";
    const token = localStorage.getItem("token");

    const contactsList = document.getElementById("contacts-list");
    const contactsSuccess = document.getElementById("contacts-success");
    const contactsError = document.getElementById("contacts-error");

    const emptyState = document.getElementById("empty-contacts-state");

    const showFormBtn = document.getElementById("show-add-contact-form");
    const addForm = document.getElementById("add-contact-form");

    const saveBtn = document.getElementById("save-contact");
    const cancelBtn = document.getElementById("cancel-add-contact");

    const inputName = document.getElementById("new-contact-name");
    const inputPhone = document.getElementById("new-contact-phone");
    const inputEmail = document.getElementById("new-contact-email");


    // ====================================================
    // LOAD CONTACTS ON PAGE LOAD
    // ====================================================
    loadContacts();

    async function loadContacts() {
        try {
            const res = await fetch(`${API_URL}/profile`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = await res.json();
            if (!data.success) throw new Error("Failed to load contacts");

            const contacts = data.user.emergency_contacts || [];

            if (contacts.length === 0) {
                contactsList.innerHTML = "";
                emptyState.classList.remove("hidden");
                return;
            }

            emptyState.classList.add("hidden");
            renderContacts(contacts);
        } catch (err) {
            console.error(err);
        }
    }


    // ====================================================
    // RENDER CONTACT LIST
    // ====================================================
    function renderContacts(contacts) {
        contactsList.innerHTML = "";

        contacts.forEach(c => {
            const div = document.createElement("div");
            div.classList.add("contact-item");
            div.innerHTML = `
                <div>
                    <strong>${c.contact_name}</strong><br>
                    <span>${c.contact_phone}</span><br>
                    <span>${c.contact_email}</span>
                </div>
                <button class="btn-delete" data-id="${c.id}">Delete</button>
            `;

            div.querySelector(".btn-delete").addEventListener("click", () => {
                deleteContact(c.id);
            });

            contactsList.appendChild(div);
        });
    }


    // ====================================================
    // SHOW ADD FORM
    // ====================================================
    showFormBtn.addEventListener("click", () => {
        addForm.style.display = "block";
        showFormBtn.style.display = "none";
    });

    cancelBtn.addEventListener("click", () => {
        addForm.style.display = "none";
        showFormBtn.style.display = "block";
        clearInputs();
    });


    // ====================================================
    // SAVE NEW CONTACT
    // ====================================================
    saveBtn.addEventListener("click", async () => {

        const body = {
            contact_name: inputName.value.trim(),
            contact_phone: inputPhone.value.trim(),
            contact_email: inputEmail.value.trim(),
        };

        try {
            const res = await fetch(`${API_URL}/profile/emergency-contacts`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });

            const data = await res.json();

            if (!data.success) {
                showError(contactsError, data.message);
                return;
            }

            showSuccess(contactsSuccess, "Contact added successfully!");
            addForm.style.display = "none";
            showFormBtn.style.display = "block";

            clearInputs();
            loadContacts();

        } catch (err) {
            showError(contactsError, "Failed to add contact");
        }
    });


    // ====================================================
    // DELETE CONTACT
    // ====================================================
    async function deleteContact(id) {
        try {
            const res = await fetch(`${API_URL}/profile/emergency-contacts/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = await res.json();

            if (!data.success) {
                showError(contactsError, data.message);
                return;
            }

            showSuccess(contactsSuccess, "Contact deleted");
            loadContacts();

        } catch (err) {
            showError(contactsError, "Delete failed");
        }
    }


    function clearInputs() {
        inputName.value = "";
        inputPhone.value = "";
        inputEmail.value = "";
    }
});

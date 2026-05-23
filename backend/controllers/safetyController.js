const db = require("../config/database");
const emailService = require("../services/emailService");
const { extractLicensePlate } = require("../services/geminiService"); // Gemini AI service
const locationService = require("../../js/locationService"); // Reverse geocoding

console.log("Safety controller: Loaded successfully.");

// In-memory cooldown tracker for SOS
const sosCooldowns = new Map();

// ===========================================================
// 🚨 SOS ALERT HANDLER
// ===========================================================
exports.triggerSOS = async (req, res) => {
  try {
    const userId = req.user.id;
    const cooldownKey = `user_${userId}`;
    const now = Date.now();
    const lastSosTime = sosCooldowns.get(cooldownKey);

    // Rate limit SOS (1 minute)
    if (lastSosTime && now - lastSosTime < 60000) {
      const remainingTime = Math.ceil((60000 - (now - lastSosTime)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${remainingTime} seconds before triggering another SOS alert.`,
        cooldownRemaining: remainingTime,
      });
    }

    // Fetch user
    const [users] = await db.query(
      "SELECT id, username, full_name, phone_number, email FROM users WHERE id = ?",
      [userId]
    );
    if (users.length === 0)
      return res.status(404).json({ success: false, message: "User not found" });

    const user = users[0];
    const userName = user.full_name || user.username;

    // Fetch emergency contacts
    const [emergencyContacts] = await db.query(
      "SELECT id, contact_name, contact_phone, contact_email FROM emergency_contacts WHERE user_id = ? ORDER BY created_at ASC",
      [userId]
    );

    if (emergencyContacts.length === 0)
      return res.status(400).json({
        success: false,
        message:
          "No emergency contacts found. Please add contacts before triggering SOS.",
        requiresContacts: true,
      });

    const contactsWithEmail = emergencyContacts.filter(
      (contact) => contact.contact_email
    );
    if (contactsWithEmail.length === 0)
      return res.status(400).json({
        success: false,
        message:
          "No emergency contacts with email addresses found. Please update contact emails.",
        requiresEmails: true,
      });

    // Validate location
    const location = req.body.location;
    if (!location || !location.latitude || !location.longitude)
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required.",
      });

    // Log SOS event
    await db.query(
      "INSERT INTO sos_logs (user_id, latitude, longitude, accuracy, contacts_count, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [
        userId,
        location.latitude,
        location.longitude,
        location.accuracy || null,
        contactsWithEmail.length,
      ]
    );

    sosCooldowns.set(cooldownKey, now);

    console.log(
      `Sending SOS alerts to ${contactsWithEmail.length} contacts for user ${userName}`
    );

    const emailResults =
      await emailService.sendEmergencyAlertsToMultipleContacts(
        contactsWithEmail,
        userName,
        location
      );

    const successfulEmails = emailResults.filter((r) => r.success);
    const failedEmails = emailResults.filter((r) => !r.success);

    console.log(
      `SOS Email Results: ${successfulEmails.length} successful, ${failedEmails.length} failed`
    );

    const response = {
      success: successfulEmails.length > 0,
      message:
        successfulEmails.length > 0
          ? `Emergency alert sent to ${successfulEmails.length} of ${contactsWithEmail.length} contacts.`
          : "Failed to send emergency alerts.",
      sosId: `${userId}_${Date.now()}`,
      location,
      contactsNotified: successfulEmails.length,
      totalContacts: contactsWithEmail.length,
      timestamp: new Date().toISOString(),
      emailResults: { successful: successfulEmails, failed: failedEmails },
    };

    // Send copy to user
    if (user.email && emailService.isServiceReady()) {
      try {
        await emailService.sendEmergencyAlert(user.email, userName, location);
      } catch (error) {
        console.warn("Failed to send user copy:", error.message);
      }
    }

    res.status(successfulEmails.length > 0 ? 200 : 500).json(response);
  } catch (error) {
    console.error("SOS trigger error:", error);
    sosCooldowns.delete(`user_${req.user.id}`);
    res.status(500).json({
      success: false,
      message: "Failed to process SOS alert.",
    });
  }
};

// ===========================================================
// 🚗 CHECK RECENT AUTO CAPTURE (3 HOURS)
// ===========================================================
exports.checkRecentAutoCapture = async (req, res) => {
  try {
    const userId = req.user.id;
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const [recentCapture] = await db.query(
      `SELECT license_plate, captured_at 
       FROM auto_captures 
       WHERE user_id = ? AND captured_at >= ?
       ORDER BY captured_at DESC
       LIMIT 1`,
      [userId, threeHoursAgo]
    );

    if (recentCapture.length > 0)
      return res.json({
        success: true,
        isRecent: true,
        license_plate: recentCapture[0].license_plate,
        captured_at: recentCapture[0].captured_at,
      });

    res.json({ success: true, isRecent: false });
  } catch (error) {
    console.error("Check recent auto capture error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check recent auto capture.",
    });
  }
};

// ===========================================================
// 🌙 NIGHT MODE TRACKING UPDATE (Fixed + Immediate Mail)
// ===========================================================
exports.sendNightLocationUpdate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { location, autoNumber } = req.body;

    if (!location || !location.latitude || !location.longitude) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required.",
      });
    }

    // Fetch user info
    const [users] = await db.query(
      "SELECT id, username, full_name, email FROM users WHERE id = ?",
      [userId]
    );
    if (users.length === 0)
      return res.status(404).json({ success: false, message: "User not found" });

    const user = users[0];
    const userName = user.full_name || user.username;

    // Fetch emergency contacts with emails
    const [contacts] = await db.query(
      "SELECT contact_name, contact_email FROM emergency_contacts WHERE user_id = ? AND contact_email IS NOT NULL",
      [userId]
    );

    if (!contacts.length) {
      console.warn(`No emergency contacts found for ${userName}`);
      return res.json({
        success: false,
        message: "No emergency contacts configured with email.",
      });
    }

    // Prepare email sending
    const locationData = {
      latitude: parseFloat(location.latitude),
      longitude: parseFloat(location.longitude),
      accuracy: location.accuracy || null,
    };

    console.log(
      `📍 [NightTrack] ${userName} -> Sending location to ${contacts.length} contacts:`,
      locationData
    );

    // Send emails concurrently
    const emailPromises = contacts.map((c) =>
      emailService.sendLocationTrackingEmail(
        c.contact_email,
        userName,
        locationData,
        autoNumber
      )
    );

    const results = await Promise.allSettled(emailPromises);
    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;

    console.log(
      `📩 [NightTrack] Sent ${successful}/${contacts.length} Night Mode tracking emails.`
    );

    res.json({
      success: successful > 0,
      message:
        successful > 0
          ? `Night Mode update sent to ${successful} of ${contacts.length} contacts.`
          : "Failed to send tracking emails.",
      data: {
        userName,
        autoNumber,
        location: locationData,
        contactsCount: contacts.length,
        sentCount: successful,
      },
    });
  } catch (error) {
    console.error("❌ Night location update error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send Night Mode update email.",
      error: error.message,
    });
  }
};

// ===========================================================
// 📷 AUTO NUMBER CAPTURE (Gemini AI Integration)
// ===========================================================
exports.captureAutoNumber = async (req, res) => {
  try {
    const userId = req.user.id;
    const { imageBase64, latitude, longitude } = req.body;

    if (!imageBase64 || !latitude || !longitude)
      return res.status(400).json({
        success: false,
        message: "Image data, latitude, and longitude are required.",
      });

    let licensePlate = "UNKNOWN_PLATE";
    try {
      licensePlate = await extractLicensePlate(imageBase64);
      console.log("Gemini extracted plate:", licensePlate);
    } catch (aiError) {
      console.warn("Gemini AI failed:", aiError.message);
    }

    if (!licensePlate || licensePlate.length < 5)
      licensePlate = "UNKNOWN_PLATE";

    let locationAddress = `${parseFloat(latitude).toFixed(6)}, ${parseFloat(
      longitude
    ).toFixed(6)}`;
    try {
      const addressData = await locationService.reverseGeocode(
        latitude,
        longitude
      );
      if (addressData?.display_name) locationAddress = addressData.display_name;
    } catch (geoError) {
      console.warn("Reverse geocoding failed:", geoError.message);
    }

    const [result] = await db.query(
      `INSERT INTO auto_captures (user_id, license_plate, capture_latitude, capture_longitude, location_address)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, licensePlate, latitude, longitude, locationAddress]
    );

    res.status(201).json({
      success: true,
      message: "License plate captured successfully.",
      data: {
        id: result.insertId,
        license_plate: licensePlate,
        location: locationAddress,
        captured_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Auto number capture error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while processing capture.",
    });
  }
};

// ===========================================================
// 📜 AUTO CAPTURE HISTORY
// ===========================================================
exports.getAutoCaptureHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const [history] = await db.query(
      `SELECT id, license_plate, capture_latitude, capture_longitude, location_address, captured_at
       FROM auto_captures
       WHERE user_id = ?
       ORDER BY captured_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json({
      success: true,
      history: history.map((item) => ({
        id: item.id,
        license_plate: item.license_plate,
        latitude: parseFloat(item.capture_latitude),
        longitude: parseFloat(item.capture_longitude),
        location:
          item.location_address ||
          `${item.capture_latitude}, ${item.capture_longitude}`,
        captured_at: item.captured_at,
      })),
    });
  } catch (error) {
    console.error("Get capture history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch capture history.",
    });
  }
};

// ===========================================================
// 🔄 SOS STATUS CHECK (Fixed)
// ===========================================================
exports.getSOSStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const cooldownKey = `user_${userId}`;
    const now = Date.now();
    const lastSosTime = sosCooldowns.get(cooldownKey);

    let canTrigger = true;
    let cooldownRemaining = 0;

    if (lastSosTime && now - lastSosTime < 60000) {
      canTrigger = false;
      cooldownRemaining = Math.ceil((60000 - (now - lastSosTime)) / 1000);
    }

    const [contactCount] = await db.query(
      "SELECT COUNT(*) as count FROM emergency_contacts WHERE user_id = ? AND contact_email IS NOT NULL",
      [userId]
    );

    res.json({
      success: true,
      canTrigger,
      cooldownRemaining,
      emergencyContactsWithEmail: contactCount[0].count,
      emailServiceReady: emailService.isServiceReady(),
    });
  } catch (error) {
    console.error("SOS status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get SOS status",
    });
  }
};

// ===========================================================
// 🧾 SOS LOG HISTORY
// ===========================================================
exports.getSOSLogs = async (req, res) => {
  try {
    const userId = req.user.id;
    const [logs] = await db.query(
      `SELECT id, latitude, longitude, accuracy, contacts_count, created_at
       FROM sos_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    res.json({
      success: true,
      logs: logs.map((log) => ({
        id: log.id,
        location: {
          latitude: parseFloat(log.latitude),
          longitude: parseFloat(log.longitude),
          accuracy: log.accuracy ? parseFloat(log.accuracy) : null,
        },
        contactsNotified: log.contacts_count,
        timestamp: log.created_at,
        googleMapsLink: `https://www.google.com/maps?q=${log.latitude},${log.longitude}&z=18`,
      })),
    });
  } catch (error) {
    console.error("SOS logs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get SOS logs",
    });
  }
};

// ===========================================================
// 🧪 TEST EMAIL SERVICE
// ===========================================================
exports.testEmailService = async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production" && !req.body.forceTest) {
      return res
        .status(403)
        .json({ success: false, message: "Email testing not allowed in production." });
    }

    const result = await emailService.testConfiguration();
    res.json({
      success: result.success,
      message: result.message,
      messageId: result.messageId || null,
    });
  } catch (error) {
    console.error("Email test error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to test email service",
    });
  }
};

// ===========================================================
// 🧹 CLEANUP COOL DOWNS
// ===========================================================
function cleanupCooldowns() {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  for (const [key, timestamp] of sosCooldowns.entries()) {
    if (now - timestamp > oneHour) sosCooldowns.delete(key);
  }
}
setInterval(cleanupCooldowns, 10 * 60 * 1000);

// ===========================================================
// EXPORTS
// ===========================================================
module.exports = {
  triggerSOS: exports.triggerSOS,
  getSOSStatus: exports.getSOSStatus,
  getSOSLogs: exports.getSOSLogs,
  testEmailService: exports.testEmailService,
  captureAutoNumber: exports.captureAutoNumber,
  getAutoCaptureHistory: exports.getAutoCaptureHistory,
  sendNightLocationUpdate: exports.sendNightLocationUpdate,
  checkRecentAutoCapture: exports.checkRecentAutoCapture,
};

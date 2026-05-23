require("dotenv").config();
const nodemailer = require("nodemailer");

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initializeTransporter();
  }

  // Initialize Gmail SMTP transporter
  initializeTransporter() {
    try {
      // Check if environment variables are set
      if (!process.env.GMAIL_EMAIL || !process.env.GMAIL_APP_PASSWORD) {
        console.warn(
          "Gmail credentials not configured. Email service will be disabled."
        );
        return;
      }

      this.transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_EMAIL,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
        tls: {
          rejectUnauthorized: false, // Allow self-signed certificates
        },
      });

      // Verify connection
      this.transporter.verify((error, success) => {
        if (error) {
          console.error("Email service configuration error:", error);
          this.isConfigured = false;
        } else {
          console.log("Email service configured successfully");
          this.isConfigured = true;
        }
      });
    } catch (error) {
      console.error("Failed to initialize email service:", error);
      this.isConfigured = false;
    }
  }

  // Generate Google Maps URL for coordinates
  generateGoogleMapsUrl(latitude, longitude) {
    return `https://www.google.com/maps?q=${latitude},${longitude}&z=18`;
  }

  // Generate emergency email HTML template
  generateEmergencyEmailTemplate(userName, location, mapImageUrl) {
    const googleMapsUrl = this.generateGoogleMapsUrl(
      location.latitude,
      location.longitude
    );
    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "long",
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🚨 EMERGENCY ALERT</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
          }
          .alert-header {
            background: linear-gradient(135deg, #ff6b6b, #dc3545);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
            margin-bottom: 0;
          }
          .alert-header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: bold;
          }
          .alert-content {
            background: white;
            padding: 30px;
            border-radius: 0 0 10px 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .emergency-info {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .location-info {
            background: #d1ecf1;
            border: 1px solid #bee5eb;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .location-map {
            background: #e9ecef;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
          }
          .location-map img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            border: 1px solid #dee2e6;
          }
          .action-button {
            display: inline-block;
            background: #007bff;
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            margin: 10px 0;
            text-align: center;
          }
          .action-button:hover {
            background: #0056b3;
          }
          .footer {
            background: #6c757d;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 10px;
            margin-top: 30px;
            font-size: 14px;
          }
          .coordinates {
            font-family: 'Courier New', monospace;
            background: #f8f9fa;
            padding: 10px;
            border-radius: 5px;
            border: 1px solid #dee2e6;
            margin: 10px 0;
          }
          .timestamp {
            color: #6c757d;
            font-size: 14px;
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="alert-header">
          <h1>🚨 EMERGENCY ALERT</h1>
          <p style="margin: 10px 0 0 0; font-size: 18px;">Immediate Attention Required</p>
        </div>

        <div class="alert-content">
          <div class="emergency-info">
            <h2 style="color: #856404; margin-top: 0;">⚠️ Emergency Situation</h2>
            <p><strong>${userName}</strong> has triggered an emergency alert and needs immediate assistance.</p>
            <p><strong>Time of Alert:</strong> ${timestamp}</p>
          </div>

          <div class="location-info">
            <h3 style="color: #0c5460; margin-top: 0;">📍 Current Location</h3>
            <div class="coordinates">
              <strong>Coordinates:</strong><br>
              Latitude: ${location.latitude}<br>
              Longitude: ${location.longitude}
            </div>
            ${
              location.accuracy
                ? `<p><strong>Location Accuracy:</strong> ${location.accuracy} meters</p>`
                : ""
            }
            <p style="text-align: center; margin: 20px 0;">
              <a href="${googleMapsUrl}" class="action-button" target="_blank">
                🗺️ View Location on Google Maps
              </a>
            </p>
          </div>

          ${
            mapImageUrl
              ? `
          <div class="location-map">
            <h3 style="margin-top: 0;">📷 Location Map</h3>
            <img src="${mapImageUrl}" alt="Location Map" style="max-width: 100%; height: auto;">
            <p style="margin-top: 10px; font-size: 14px; color: #6c757d;">
              Map showing the user's current location
            </p>
          </div>
          `
              : ""
          }

          <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #155724; margin-top: 0;">✅ Immediate Actions Required</h3>
            <ol style="margin: 0; padding-left: 20px;">
              <li>Contact <strong>${userName}</strong> immediately</li>
              <li>Verify their safety and current situation</li>
              <li>If needed, alert emergency services (dial 100 for police, 108 for ambulance)</li>
              <li>Provide assistance or arrange for help to reach their location</li>
            </ol>
          </div>
        </div>

        <div class="footer">
          <p><strong>This is an automated emergency alert from ShareRickshaw app</strong></p>
          <p style="margin: 5px 0;">Please take this alert seriously and respond immediately.</p>
          <p style="margin: 5px 0; font-size: 12px;">Generated on ${timestamp}</p>
        </div>
      </body>
      </html>
    `;
  }

  // Send emergency alert email
  async sendEmergencyAlert(email, userName, location, mapImageUrl = null) {
    try {
      if (!this.isConfigured) {
        throw new Error("Email service not configured");
      }

      const subject = `🚨 EMERGENCY ALERT - ${userName} needs help!`;
      const htmlContent = this.generateEmergencyEmailTemplate(
        userName,
        location,
        mapImageUrl
      );

      const mailOptions = {
        from: `"ShareRickshaw Safety" <${process.env.GMAIL_EMAIL}>`,
        to: email,
        subject: subject,
        html: htmlContent,
        priority: "high", // Set high priority for emergency emails
        headers: {
          "X-Priority": "1", // Highest priority
          "X-MSMail-Priority": "High",
          Importance: "high",
        },
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(
        `Emergency email sent successfully to ${email}:`,
        result.messageId
      );

      return {
        success: true,
        messageId: result.messageId,
        email: email,
      };
    } catch (error) {
      console.error(`Failed to send emergency email to ${email}:`, error);

      // Return detailed error information
      return {
        success: false,
        error: error.message,
        email: email,
        errorCode: error.code || "UNKNOWN_ERROR",
      };
    }
  }

  // Send emergency alerts to multiple contacts with retry logic
  async sendEmergencyAlertsToMultipleContacts(
    contacts,
    userName,
    location,
    maxRetries = 3
  ) {
    console.log("=== Sending Emergency Alerts ===");
    console.log("Total contacts:", contacts.length);
    console.log("Email service ready:", this.isServiceReady());
    console.log(
      "Gmail credentials configured:",
      !!(process.env.GMAIL_EMAIL && process.env.GMAIL_APP_PASSWORD)
    );

    const results = [];

    for (const contact of contacts) {
      console.log(
        `Processing contact: ${contact.contact_name}, Email: ${contact.contact_email}`
      );

      if (!contact.contact_email) {
        console.log(`Skipping contact ${contact.contact_name} - no email`);
        results.push({
          success: false,
          error: "No email address provided",
          contact: contact,
          errorCode: "NO_EMAIL",
        });
        continue;
      }

      let lastError = null;
      let success = false;

      // Retry logic with exponential backoff
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await this.sendEmergencyAlert(
            contact.contact_email,
            userName,
            location
          );

          if (result.success) {
            results.push({
              success: true,
              messageId: result.messageId,
              contact: contact,
              attempt: attempt,
            });
            success = true;
            break;
          } else {
            lastError = result.error;

            // If it's not a network error, don't retry
            if (
              result.errorCode !== "ETIMEDOUT" &&
              result.errorCode !== "ENOTFOUND"
            ) {
              break;
            }

            // Wait before retry (exponential backoff)
            if (attempt < maxRetries) {
              const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
              await new Promise((resolve) => setTimeout(resolve, waitTime));
            }
          }
        } catch (error) {
          lastError = error.message;

          // Wait before retry (exponential backoff)
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000;
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }
      }

      if (!success) {
        results.push({
          success: false,
          error: lastError || "Unknown error",
          contact: contact,
          errorCode: "MAX_RETRIES_EXCEEDED",
        });
      }

      // Add delay between emails to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  }

  // NEW: Generate location tracking email template
  generateTrackingEmailTemplate(userName, location, autoNumber = null) {
    const googleMapsUrl = this.generateGoogleMapsUrl(
      location.latitude,
      location.longitude
    );
    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "long",
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>📍 Live Location Update for ${userName}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
          }
          .header {
            background: linear-gradient(135deg, #1976d2, #4ECDC4);
            color: white;
            padding: 25px;
            text-align: center;
            border-radius: 10px 10px 0 0;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .content {
            background: white;
            padding: 30px;
            border-radius: 0 0 10px 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .info-block {
            background: #e3f2fd;
            border: 1px solid #bbdefb;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .action-button {
            display: inline-block;
            background: #FF6B6B;
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            margin: 10px 0;
            text-align: center;
          }
          .action-button:hover {
            background: #ff5252;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 12px;
            color: #999;
          }
          .coordinates {
            font-family: 'Courier New', monospace;
            background: #f8f9fa;
            padding: 10px;
            border-radius: 5px;
            border: 1px solid #dee2e6;
            margin: 10px 0;
          }
          .auto-plate {
            font-size: 20px;
            font-weight: bold;
            color: #333;
            background: #fff3cd;
            padding: 8px 15px;
            border-radius: 6px;
            margin-top: 10px;
            display: inline-block;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📍 Live Location Update</h1>
          <p style="margin: 5px 0 0 0;">${userName} is currently traveling</p>
        </div>

        <div class="content">
          <p>This automated email confirms the current location of <strong>${userName}</strong> as part of the Night Safety Mode feature.</p>

          <div class="info-block">
            <h3 style="color: #1565c0; margin-top: 0;">Current Details</h3>
            <p><strong>Time of Update:</strong> ${timestamp}</p>
            
            ${
              autoNumber
                ? `<p><strong>Auto Rickshaw Number:</strong> <span class="auto-plate">${autoNumber}</span></p>`
                : `<p>Auto Rickshaw Number: Not shared for this trip.</p>`
            }
            
            <h4 style="margin-top: 15px; margin-bottom: 5px;">Geographic Coordinates:</h4>
            <div class="coordinates">
              Latitude: ${location.latitude}<br>
              Longitude: ${location.longitude}
            </div>
            ${
              location.accuracy
                ? `<p><strong>Location Accuracy:</strong> ${location.accuracy} meters</p>`
                : ""
            }

            <p style="text-align: center; margin: 20px 0;">
              <a href="${googleMapsUrl}" class="action-button" target="_blank">
                🗺️ View Live Location on Map
              </a>
            </p>
          </div>
          
          <p style="font-size: 14px; text-align: center; color: #d32f2f;">
            If you are concerned for their safety, please try contacting them directly.<br>
            Tracking will stop when the user completes their trip or disables Night Mode.
          </p>
        </div>

        <div class="footer">
          <p>This is an automated safety update from ShareRickshaw app</p>
        </div>
      </body>
      </html>
    `;
  }

  // NEW: Send location tracking email
  async sendLocationTrackingEmail(
    email,
    userName,
    location,
    autoNumber = null
  ) {
    try {
      if (!this.isConfigured) {
        throw new Error("Email service not configured");
      }

      const subject = `📍 Location Update: ${userName} is now at ${location.latitude.toFixed(
        4
      )}, ${location.longitude.toFixed(4)}`;
      const htmlContent = this.generateTrackingEmailTemplate(
        userName,
        location,
        autoNumber
      );

      const mailOptions = {
        from: `"ShareRickshaw Tracking" <${process.env.GMAIL_EMAIL}>`,
        to: email,
        subject: subject,
        html: htmlContent,
        priority: "normal",
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(
        `Tracking email sent successfully to ${email}:`,
        result.messageId
      );

      return {
        success: true,
        messageId: result.messageId,
        email: email,
      };
    } catch (error) {
      console.error(`Failed to send tracking email to ${email}:`, error);

      // Return detailed error information
      return {
        success: false,
        error: error.message,
        email: email,
        errorCode: error.code || "UNKNOWN_ERROR",
      };
    }
  }

  // Test email service configuration
  async testConfiguration() {
    if (!this.isConfigured) {
      return {
        success: false,
        message:
          "Email service not configured. Please check GMAIL_EMAIL and GMAIL_APP_PASSWORD environment variables.",
      };
    }

    try {
      const testMailOptions = {
        from: process.env.GMAIL_EMAIL,
        to: process.env.GMAIL_EMAIL, // Send test email to self
        subject: "ShareRickshaw Email Service Test",
        text: "This is a test email to verify the ShareRickshaw email service is working correctly.",
        html: "<p>This is a test email to verify the <strong>ShareRickshaw</strong> email service is working correctly.</p>",
      };

      const result = await this.transporter.sendMail(testMailOptions);

      return {
        success: true,
        message: "Test email sent successfully",
        messageId: result.messageId,
      };
    } catch (error) {
      return {
        success: false,
        message: `Test email failed: ${error.message}`,
        error: error.message,
      };
    }
  }

  // Check if email service is ready
  isServiceReady() {
    return this.isConfigured && this.transporter;
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;

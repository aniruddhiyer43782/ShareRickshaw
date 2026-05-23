const db = require('../config/database');

// GET /api/profile
// Purpose: Get current user's profile data
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Query user data
    const [users] = await db.query(
      'SELECT id, username, email, phone_number, role FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = users[0];

    // If role is 'user', fetch emergency contacts
    if (user.role === 'user') {
      const [emergencyContacts] = await db.query(
        'SELECT id, contact_name, contact_phone, contact_email FROM emergency_contacts WHERE user_id = ? ORDER BY created_at ASC',
        [userId]
      );

      return res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone_number: user.phone_number,
          role: user.role,
          emergency_contacts: emergencyContacts
        }
      });
    }

    // If role is 'autowala', fetch autowala details
    if (user.role === 'autowala') {
      const [autowalaDetails] = await db.query(
        'SELECT driver_name, driver_phone, operating_location, license_plate FROM autowala_details WHERE user_id = ?',
        [userId]
      );

      if (autowalaDetails.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Autowala details not found'
        });
      }

      const autowala = autowalaDetails[0];

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          driver_name: autowala.driver_name,
          phone_number: autowala.driver_phone,
          operating_location: autowala.operating_location,
          license_plate: autowala.license_plate
        }
      });
    }

    // Admin or other roles - return basic info
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// PATCH /api/profile
// Purpose: Update user's profile information
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone_number, driver_name, operating_location } = req.body;

    // Check if at least one field is provided
    if (!phone_number && !driver_name && !operating_location) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Get user role
    const [users] = await db.query(
      'SELECT role FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userRole = users[0].role;

    // If regular user, only allow phone_number update
    if (userRole === 'user') {
      if (!phone_number) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }

      // Validate phone format
      const phoneRegex = /^\d{10}$/;
      if (!phoneRegex.test(phone_number.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Phone number must be exactly 10 digits'
        });
      }

      // Update users table
      await db.query(
        'UPDATE users SET phone_number = ? WHERE id = ?',
        [phone_number.trim(), userId]
      );

      // Fetch updated user data
      const [updatedUsers] = await db.query(
        'SELECT id, username, email, phone_number, role FROM users WHERE id = ?',
        [userId]
      );

      return res.json({
        success: true,
        message: 'Profile updated successfully',
        user: updatedUsers[0]
      });
    }

    // If autowala, allow driver_name, phone_number, operating_location updates
    if (userRole === 'autowala') {
      const updates = [];
      const values = [];

      if (driver_name) {
        const trimmedDriverName = driver_name.trim();
        if (trimmedDriverName.length < 2 || trimmedDriverName.length > 100) {
          return res.status(400).json({
            success: false,
            message: 'Driver name must be 2-100 characters'
          });
        }
        updates.push('driver_name = ?');
        values.push(trimmedDriverName);
      }

      if (phone_number) {
        const trimmedPhone = phone_number.trim();
        const phoneRegex = /^\d{10}$/;
        if (!phoneRegex.test(trimmedPhone)) {
          return res.status(400).json({
            success: false,
            message: 'Phone number must be exactly 10 digits'
          });
        }
        updates.push('driver_phone = ?');
        values.push(trimmedPhone);
      }

      if (operating_location) {
        const trimmedLocation = operating_location.trim();
        if (trimmedLocation.length < 2 || trimmedLocation.length > 100) {
          return res.status(400).json({
            success: false,
            message: 'Operating location must be 2-100 characters'
          });
        }
        updates.push('operating_location = ?');
        values.push(trimmedLocation);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }

      // Add updated_at
      updates.push('updated_at = NOW()');
      values.push(userId);

      // Update autowala_details table
      await db.query(
        `UPDATE autowala_details SET ${updates.join(', ')} WHERE user_id = ?`,
        values
      );

      // Fetch updated autowala data
      const [updatedUsers] = await db.query(
        'SELECT u.id, u.email, u.role, a.driver_name, a.driver_phone, a.operating_location, a.license_plate FROM users u LEFT JOIN autowala_details a ON u.id = a.user_id WHERE u.id = ?',
        [userId]
      );

      return res.json({
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: updatedUsers[0].id,
          email: updatedUsers[0].email,
          role: updatedUsers[0].role,
          driver_name: updatedUsers[0].driver_name,
          phone_number: updatedUsers[0].driver_phone,
          operating_location: updatedUsers[0].operating_location,
          license_plate: updatedUsers[0].license_plate
        }
      });
    }

    // Other roles not supported
    res.status(400).json({
      success: false,
      message: 'Profile update not supported for this role'
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// POST /api/profile/emergency-contacts
// Purpose: Add new emergency contact for regular users
exports.addEmergencyContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contact_name, contact_phone, contact_email } = req.body;

    // Validate required fields
    if (!contact_name || !contact_phone || !contact_email) {
      return res.status(400).json({
        success: false,
        message: 'Contact name, phone, and email are required'
      });
    }

    // Get user role
    const [users] = await db.query(
      'SELECT role FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify user role is 'user'
    if (users[0].role !== 'user') {
      return res.status(403).json({
        success: false,
        message: 'Only regular users can add emergency contacts'
      });
    }

    // Trim inputs
    const trimmedName = contact_name.trim();
    const trimmedPhone = contact_phone.trim();
    const trimmedEmail = contact_email.trim().toLowerCase();

    // Validate contact name length
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Contact name must be 2-100 characters'
      });
    }

    // Validate phone format
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Contact phone must be exactly 10 digits'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Check for duplicate email within user's contacts
    const [existingContacts] = await db.query(
      'SELECT id FROM emergency_contacts WHERE user_id = ? AND contact_email = ?',
      [userId, trimmedEmail]
    );

    if (existingContacts.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A contact with this email already exists'
      });
    }

    // Insert into emergency_contacts table
    const [result] = await db.query(
      'INSERT INTO emergency_contacts (user_id, contact_name, contact_phone, contact_email, created_at) VALUES (?, ?, ?, ?, NOW())',
      [userId, trimmedName, trimmedPhone, trimmedEmail]
    );

    res.status(201).json({
      success: true,
      message: 'Emergency contact added',
      contact: {
        id: result.insertId,
        contact_name: trimmedName,
        contact_phone: trimmedPhone,
        contact_email: trimmedEmail
      }
    });

  } catch (error) {
    console.error('Add emergency contact error:', error);
    console.error('Request body received:', req.body);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// GET /api/profile/emergency-contacts
// Purpose: Load all emergency contacts for current user
exports.getEmergencyContacts = async (req, res) => {
  try {
    const userId = req.user.id;

    // Verify user exists
    const [users] = await db.query(
      "SELECT role FROM users WHERE id = ?",
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Fetch contacts
    const [contacts] = await db.query(
      "SELECT id, contact_name, contact_phone, contact_email FROM emergency_contacts WHERE user_id = ? ORDER BY created_at ASC",
      [userId]
    );

    return res.json({
      success: true,
      contacts
    });

  } catch (error) {
    console.error("Get emergency contacts error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// DELETE /api/profile/emergency-contacts/:id
// Purpose: Delete an emergency contact
exports.deleteEmergencyContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = req.params.id;

    // Validate contact ID
    if (!contactId || isNaN(contactId) || parseInt(contactId) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID'
      });
    }

    // Verify contact exists and belongs to current user
    const [contacts] = await db.query(
      'SELECT id FROM emergency_contacts WHERE id = ? AND user_id = ?',
      [parseInt(contactId), userId]
    );

    if (contacts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Delete contact
    await db.query(
      'DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?',
      [parseInt(contactId), userId]
    );

    res.json({
      success: true,
      message: 'Emergency contact deleted'
    });

  } catch (error) {
    console.error('Delete emergency contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

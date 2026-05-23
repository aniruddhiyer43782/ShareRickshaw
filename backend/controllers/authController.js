const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/database");
require("dotenv").config();

/* ========================================================================
   ADMIN LOGIN
   POST /api/auth/login
   ======================================================================== */
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({
        success: false,
        message: "Username and password required",
      });


const [users] = await db.query(
  "SELECT id, username, email, phone_number, role, password_hash FROM users WHERE LOWER(email) = ? AND role IN (?, ?)",
  [trimmedEmail, "user", "autowala"]
);



    if (users.length === 0)
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });

    const user = users[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword)
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: "admin",
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ========================================================================
   VERIFY TOKEN
   ======================================================================== */
exports.verify = async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user,
    });
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ========================================================================
   SIGNUP - REGULAR USER
   ======================================================================== */
exports.signup = async (req, res) => {
  try {
    const { username, email, phone_number, password } = req.body;

    if (!username || !email || !phone_number || !password)
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();

    // Validate
    if (!/^[a-zA-Z0-9_]{3,50}$/.test(trimmedUsername))
      return res.status(400).json({
        success: false,
        message: "Username must be 3-50 characters",
      });

    if (!/^\d{10}$/.test(phone_number.trim()))
      return res.status(400).json({
        success: false,
        message: "Phone number must be 10 digits",
      });

    if (password.length < 6)
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });

    // Check duplicate email/username
    const [existing] = await db.query(
      "SELECT id FROM users WHERE LOWER(email)=LOWER(?) OR LOWER(username)=LOWER(?)",
      [trimmedEmail, trimmedUsername]
    );

    if (existing.length)
      return res.status(409).json({
        success: false,
        message: "Email or username already exists",
      });

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      "INSERT INTO users (username, email, phone_number, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [trimmedUsername, trimmedEmail, phone_number.trim(), passwordHash, "user"]
    );

    const userId = result.insertId;

    const token = jwt.sign(
      { id: userId, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        username: trimmedUsername,
        email: trimmedEmail,
        phone_number,
        role: "user",
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ========================================================================
   SIGNUP - AUTOWALA
   ======================================================================== */
exports.signupAutowala = async (req, res) => {
  try {
    const {
      email,
      password,
      driver_name,
      phone_number,
      operating_location,
      license_plate,
    } = req.body;

    if (
      !email ||
      !password ||
      !driver_name ||
      !phone_number ||
      !operating_location ||
      !license_plate
    )
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedDriverName = driver_name.trim();
    const trimmedPhone = phone_number.trim();
    const trimmedLocation = operating_location.trim();
    const trimmedLicense = license_plate.trim().toUpperCase();

    // Validate everything cleanly
    if (!/^\d{10}$/.test(trimmedPhone))
      return res.status(400).json({
        success: false,
        message: "Phone must be 10 digits",
      });

    const [checkEmail] = await db.query(
      "SELECT id FROM users WHERE LOWER(email)=LOWER(?)",
      [trimmedEmail]
    );

    if (checkEmail.length)
      return res.status(409).json({
        success: false,
        message: "This email is already registered",
      });

    const [checkPlate] = await db.query(
      "SELECT id FROM autowala_details WHERE license_plate=?",
      [trimmedLicense]
    );

    if (checkPlate.length)
      return res.status(409).json({
        success: false,
        message: "This license plate is already registered",
      });

    // Generate username automatically
    let baseUsername = trimmedDriverName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    baseUsername = `${baseUsername}_${trimmedLicense}`.slice(0, 50);

    const passwordHash = await bcrypt.hash(password, 10);

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
      const [userInsert] = await conn.query(
        "INSERT INTO users (username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, NOW())",
        [baseUsername, trimmedEmail, passwordHash, "autowala"]
      );

      const userId = userInsert.insertId;

      await conn.query(
        "INSERT INTO autowala_details (user_id, license_plate, driver_name, operating_location, driver_phone, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
        [
          userId,
          trimmedLicense,
          trimmedDriverName,
          trimmedLocation,
          trimmedPhone,
        ]
      );

      await conn.commit();
      conn.release();

      const token = jwt.sign(
        { id: userId, role: "autowala" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.status(201).json({
        success: true,
        token,
        user: {
          id: userId,
          email: trimmedEmail,
          role: "autowala",
          driver_name: trimmedDriverName,
          phone_number: trimmedPhone,
          operating_location: trimmedLocation,
          license_plate: trimmedLicense,
        },
      });
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  } catch (err) {
    console.error("Autowala signup error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ========================================================================
   LOGIN FOR USERS + AUTOWALAS
   ======================================================================== */
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });

    const trimmedEmail = email.trim().toLowerCase();

    const [users] = await db.query(
      "SELECT id, username, email, phone_number, role, password_hash FROM users WHERE LOWER(email)=? AND role IN (?, ?)",
      [trimmedEmail, "user", "autowala"]
    );

    if (users.length === 0)
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });

    const user = users[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });

    /* ============================
       LOGIN SUCCESS – RETURN DATA
       ============================ */

    // AUTOWALA
    if (user.role === "autowala") {
      const [rows] = await db.query(
        "SELECT driver_name, driver_phone, operating_location, license_plate FROM autowala_details WHERE user_id=?",
        [user.id]
      );

      const d = rows[0];

      const token = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          role: user.role,
          email: user.email,
          driver_name: d.driver_name,
          phone_number: d.driver_phone,
          operating_location: d.operating_location,
          license_plate: d.license_plate,
        },
      });
    }

    // REGULAR USER
    const token = jwt.sign(
      { id: user.id, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone_number: user.phone_number,
        role: "user",
      },
    });
  } catch (err) {
    console.error("User login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

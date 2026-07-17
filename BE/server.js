const express = require("express");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { 
  cors: { 
    origin: "*",
    methods: ["GET", "POST"]
  } 
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection String (from your .env)
const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hirehub';

// Connect to MongoDB with timeout
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000, // 5 second timeout
  socketTimeoutMS: 5000,
  connectTimeoutMS: 5000
})
  .then(() => {
    console.log('✅ MongoDB Connected Successfully!');
    console.log(`📀 Database: ${mongoose.connection.name}`);
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.log('⚠️ Running in demo mode without database...');
  });

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  mobile: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['user', 'partner', 'admin'], default: 'user' },
  category: { type: String, default: null },
  applicationStatus: { type: String, enum: ['pending', 'approved', 'rejected', null], default: null },
  documents: {
    aadhaar: { type: String, default: null },
    pan: { type: String, default: null },
    experience: { type: String, default: null },
    certificates: [{ type: String }],
  },
  location: { type: String, default: null },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const ADMIN_MOBILE = process.env.ADMIN_MOBILE || "9999999999";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@hirehub.com";

// =========================
// CREATE DEFAULT ADMIN
// =========================
mongoose.connection.once("open", async () => {
  try {
    console.log("🔍 Checking admin account...");

    let admin = await User.findOne({ mobile: ADMIN_MOBILE });

    if (!admin) {
      admin = await User.create({
        name: "Admin",
        mobile: ADMIN_MOBILE,
        email: ADMIN_EMAIL,
        role: "admin",
      });

      console.log("✅ Default admin created");
    } else {
      console.log("✅ Admin already exists");
    }
  } catch (err) {
    console.log("❌ Admin creation failed:", err.message);
  }
});
// OTP Store (in-memory)
const otpStore = new Map();

// Clean up old OTPs every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of otpStore.entries()) {
    if (now - value.timestamp > 300000) {
      otpStore.delete(key);
    }
  }
}, 60000);

async function verifyAdminRequest(req, res, next) {
  const userMobile = req.headers['x-user-mobile'];
  if (!userMobile) {
    return res.status(403).json({ success: false, error: 'Admin authorization missing' });
  }
  if (mongoose.connection.readyState === 1) {
    const adminUser = await User.findOne({ mobile: userMobile, role: 'admin' });
    if (!adminUser && userMobile !== ADMIN_MOBILE) {
      return res.status(403).json({ success: false, error: 'Admin access denied' });
    }
  } else {
    if (userMobile !== ADMIN_MOBILE) {
      return res.status(403).json({ success: false, error: 'Admin access denied' });
    }
  }
  next();
}

// =========================
// HEALTH CHECK
// =========================
app.get("/", (req, res) => {
  res.json({ 
    success: true, 
    message: "HireHub API is running!",
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    timestamp: new Date().toISOString()
  });
});

// =========================
// SEND MOBILE OTP
// =========================
app.post("/send-mobile-otp", (req, res) => {
  const { mobile } = req.body;
  
  console.log("📱 Send OTP request for:", mobile);
  
  if (!mobile || mobile.length !== 10) {
    return res.status(400).json({ 
      success: false, 
      error: "Please enter a valid 10-digit mobile number" 
    });
  }
  
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  otpStore.set(mobile, { otp, timestamp: Date.now() });
  
  console.log(`✅ OTP generated for ${mobile}: ${otp}`);
  
  res.json({ 
    success: true, 
    message: "OTP sent successfully",
    demoOtp: otp,
    isDemo: true 
  });
});

// =========================
// VERIFY MOBILE OTP
// =========================
app.post("/verify-mobile-otp", (req, res) => {
  const { mobile, otp } = req.body;
  
  console.log("🔍 Verifying OTP for:", mobile);
  
  const stored = otpStore.get(mobile);
  
  if (stored && stored.otp === otp) {
    otpStore.delete(mobile);
    console.log("✅ OTP verified successfully!");
    res.json({ success: true, message: "OTP verified successfully" });
  } else {
    console.log("❌ Invalid OTP attempt");
    res.json({ success: false, error: "Invalid OTP. Please try again." });
  }
});

// =========================
// VERIFY LOGIN (ADMIN BYPASS & REGULAR OTP)
// =========================
app.post("/verify-login", async (req, res) => {
  const { mobile, email, otp, name } = req.body;

  console.log("🔑 verify-login request for mobile:", mobile, "email:", email);

  // Admin shortcut check
  if (mobile === ADMIN_MOBILE) {
    console.log("👑 Admin shortcut triggered for", mobile);
    
    // In DB mode, retrieve or create the admin user
    if (mongoose.connection.readyState === 1) {
      try {
        let adminUser = await User.findOne({ mobile: ADMIN_MOBILE, role: 'admin' });
        if (!adminUser) {
          adminUser = await User.create({
            name: "Admin",
            mobile: ADMIN_MOBILE,
            email: ADMIN_EMAIL || "admin@hirehub.com",
            role: "admin",
          });
          console.log("✅ Default admin created in database");
        }
        
        // Generate JWT token if needed
        let token = "admin-token";
        try {
          const jwt = require("jsonwebtoken");
          token = jwt.sign({ id: adminUser._id, role: 'admin' }, process.env.JWT_SECRET || "your_super_secret_jwt_key_hirehub_2025");
        } catch (jwtErr) {
          console.warn("⚠️ jsonwebtoken package not loaded or failed:", jwtErr.message);
        }
        
        return res.json({ success: true, token, user: adminUser });
      } catch (err) {
        console.error("❌ Admin DB operation failed, falling back to demo response:", err.message);
      }
    }

    // Demo/Fallback Mode
    return res.json({
      success: true,
      token: "demo-admin-token-12345",
      user: {
        id: "admin_demo_id",
        name: "Admin (Demo)",
        mobile: ADMIN_MOBILE,
        email: ADMIN_EMAIL || "admin@hirehub.com",
        role: "admin"
      },
      isDemo: true
    });
  }

  // Regular OTP Verification/Login path via verify-login
  const key = mobile || email;
  const stored = otpStore.get(key);
  
  if (stored && stored.otp === otp) {
    otpStore.delete(key);
    
    if (mongoose.connection.readyState === 1) {
      try {
        let user = await User.findOne({ $or: [{ mobile }, { email }] });
        if (!user) {
          user = await User.create({ name: name || "User", mobile, email });
        }
        let token = "user-token";
        try {
          const jwt = require("jsonwebtoken");
          token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || "your_super_secret_jwt_key_hirehub_2025");
        } catch (jwtErr) {}
        return res.json({ success: true, token, user });
      } catch (err) {
        console.error("❌ Regular user DB operation failed:", err.message);
      }
    }

    // Demo Mode for regular user
    return res.json({
      success: true,
      token: "demo-user-token",
      user: {
        id: `guest_${key}`,
        name: name || `User ${key}`,
        mobile: mobile || "",
        email: email || "",
        role: "user"
      },
      isDemo: true
    });
  } else {
    return res.json({ success: false, msg: "Invalid OTP" });
  }
});

// =========================
// SEND EMAIL OTP
// =========================
app.post("/send-email-otp", (req, res) => {
  const { email } = req.body;
  
  console.log("📧 Send Email OTP for:", email);
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ 
      success: false, 
      error: "Please enter a valid email address" 
    });
  }
  
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  otpStore.set(email, { otp, timestamp: Date.now() });
  
  console.log(`✅ Email OTP generated for ${email}: ${otp}`);
  
  res.json({ 
    success: true, 
    message: "OTP sent to email",
    demoOtp: otp,
    isDemo: true 
  });
});

// =========================
// VERIFY EMAIL OTP
// =========================
app.post("/verify-email-otp", (req, res) => {
  const { email, otp } = req.body;
  
  const stored = otpStore.get(email);
  
  if (stored && stored.otp === otp) {
    otpStore.delete(email);
    res.json({ success: true, message: "Email verified successfully" });
  } else {
    res.json({ success: false, error: "Invalid OTP" });
  }
});

// =========================
// USER REGISTRATION / PARTNER APPLICATION
// =========================
app.post("/api/users/register", async (req, res) => {
  const { name, mobile, email, role, category, aadhaar, pan, experience, certificates, location } = req.body;
  
  try {
    // Check if user exists (only if MongoDB is connected)
    let existingUser = null;
    if (mongoose.connection.readyState === 1) {
      existingUser = await User.findOne({ $or: [{ mobile }, { email }] });
      
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          error: "User already exists with this mobile or email" 
        });
      }
    }
    
    // Create new user
    const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const normalizedRole = mobile === ADMIN_MOBILE ? 'admin' : role || 'user';
    
    let parsedLat = null;
    let parsedLng = null;
    if (location && location.includes(",")) {
      const parts = location.split(",").map((value) => parseFloat(value.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        parsedLat = parts[0];
        parsedLng = parts[1];
      }
    }

    if (mongoose.connection.readyState === 1) {
      // Save to MongoDB if connected
      const userData = {
        name,
        mobile,
        email,
        role: normalizedRole,
        location: location || null,
        lat: parsedLat,
        lng: parsedLng,
      };

      // If applying as partner, add application details
      if (role === 'partner') {
        userData.category = category;
        userData.applicationStatus = 'pending';
        userData.documents = {
          aadhaar: aadhaar || null,
          pan: pan || null,
          experience: experience || null,
          certificates: certificates || []
        };
      }
      
      const user = new User(userData);
      
      await user.save();
      
      console.log(`✅ New user registered: ${name} (${mobile})`);
      
      res.json({
        success: true,
        message: role === 'partner' ? "Partner application submitted successfully. Awaiting admin approval." : "User registered successfully",
        user: {
          id: user._id,
          name: user.name,
          mobile: user.mobile,
          email: user.email,
          role: user.role,
          applicationStatus: user.applicationStatus
        }
      });
    } else {
      // Demo mode - MongoDB not available
      console.log(`✅ New user registered (Demo): ${name} (${mobile})`);
      
      res.json({
        success: true,
        message: normalizedRole === 'partner' ? "Partner application submitted successfully (Demo Mode). Awaiting admin approval." : normalizedRole === 'admin' ? "Admin registered successfully (Demo Mode)." : "User registered successfully (Demo Mode)",
        user: {
          id: userId,
          name: name,
          mobile: mobile,
          email: email,
          role: normalizedRole,
          location: location || null,
          lat: parsedLat,
          lng: parsedLng,
          applicationStatus: normalizedRole === 'partner' ? 'pending' : null
        },
        isDemo: true
      });
    }
  } catch (error) {
    console.error("Registration error:", error.message);
    
    // Return demo response on any error
    const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    res.json({
      success: true,
      message: "User registered successfully (Demo Mode)",
      user: {
        id: userId,
        name: req.body.name,
        mobile: req.body.mobile,
        email: req.body.email,
        role: req.body.role || 'user'
      },
      isDemo: true,
      dbNote: "Registration successful but database unavailable. Data saved locally."
    });
  }
});

// =========================
// GET ALL USERS
// =========================
app.get("/api/users", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const users = await User.find().sort({ createdAt: -1 });
      res.json({ success: true, data: users });
    } else {
      // Demo mode - return empty array
      res.json({ success: true, data: [], isDemo: true, message: "Database unavailable - Demo mode" });
    }
  } catch (error) {
    console.error("Get users error:", error.message);
    res.json({ success: true, data: [], isDemo: true, message: "Database unavailable - Demo mode" });
  }
});

// =========================
// ADMIN USERS LIST
// =========================
app.get("/api/admin/users", verifyAdminRequest, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const users = await User.find().sort({ createdAt: -1 });
      res.json({ success: true, data: users });
    } else {
      res.json({ success: true, data: [], isDemo: true, message: "Database unavailable - Demo mode" });
    }
  } catch (error) {
    console.error("Get admin users error:", error.message);
    res.json({ success: true, data: [], isDemo: true, message: "Database unavailable - Demo mode" });
  }
});

// =========================
// CHECK IF MOBILE EXISTS
// =========================
app.get("/api/users/check-mobile/:mobile", async (req, res) => {
  try {
    const mobile = req.params.mobile;
    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ mobile });
      const exists = !!user || mobile === ADMIN_MOBILE;
      res.json({ success: true, exists });
    } else {
      // Demo mode - allow admin and existing mobile lookups
      const exists = mobile === ADMIN_MOBILE || true;
      res.json({ success: true, exists, isDemo: true });
    }
  } catch (error) {
    console.error("Check mobile error:", error.message);
    res.json({ success: false, error: error.message });
  }
});

// =========================
// SAMPLE BUSINESSES DATA
// =========================
const businesses = [
  { id: 1, name: "QuickFix Plumbing", category: "Plumbers", rating: 4.8, reviews: 324, price: "₹300-800", open: true, city: "Mumbai", phone: "+91 98765 43210", location: "Mumbai", lat: 19.0760, lng: 72.8777 },
  { id: 2, name: "Bright Spark Electricals", category: "Electricians", rating: 4.6, reviews: 218, price: "₹400-1200", open: true, city: "Delhi", phone: "+91 87654 32109", location: "Delhi", lat: 28.7041, lng: 77.1025 },
  { id: 3, name: "WoodCraft Carpentry", category: "Carpenters", rating: 4.9, reviews: 156, price: "₹500-2000", open: false, city: "Bangalore", phone: "+91 76543 21098", location: "Bangalore", lat: 12.9716, lng: 77.5946 },
  { id: 4, name: "Perfect Stitch Tailors", category: "Tailors", rating: 4.7, reviews: 412, price: "₹200-1500", open: true, city: "Chennai", phone: "+91 65432 10987", location: "Chennai", lat: 13.0827, lng: 80.2707 },
  { id: 5, name: "SafeDrive Services", category: "Drivers", rating: 4.4, reviews: 267, price: "₹150-500/hr", open: true, city: "Kolkata", phone: "+91 43210 98765", location: "Kolkata", lat: 22.5726, lng: 88.3639 }
];

// =========================
// GET BUSINESSES
// =========================
app.get("/api/businesses", (req, res) => {
  res.json({ success: true, data: businesses });
});

// =========================
// SEARCH BUSINESSES
// =========================
app.get("/api/businesses/search/:query", (req, res) => {
  const query = req.params.query.toLowerCase();
  const results = businesses.filter(b => 
    b.name.toLowerCase().includes(query) || 
    b.category.toLowerCase().includes(query)
  );
  res.json({ success: true, data: results });
});

// =========================
// GET SINGLE BUSINESS
// =========================
app.get("/api/businesses/:id", (req, res) => {
  const business = businesses.find(b => b.id === parseInt(req.params.id));
  if (business) {
    res.json({ success: true, data: business });
  } else {
    res.status(404).json({ success: false, error: "Business not found" });
  }
});

// =========================
// BOOKINGS STORAGE (In-memory for demo)
// =========================
let bookings = [];
let reviews = [];
let userProfiles = {};

// =========================
// CREATE BOOKING
// =========================
app.post("/api/bookings", async (req, res) => {
  try {
    const { userId, businessId, serviceDate, address, notes, amount, userLocation } = req.body;
    
    if (!userId || !businessId || !serviceDate) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields" 
      });
    }

    let userLat = null;
    let userLng = null;
    if (userLocation && userLocation.includes(",")) {
      const parts = userLocation.split(",").map((value) => parseFloat(value.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        userLat = parts[0];
        userLng = parts[1];
      }
    }

    const booking = {
      id: Date.now().toString(),
      userId,
      businessId,
      serviceDate,
      address,
      notes,
      userLocation: userLocation || null,
      userLat,
      userLng,
      amount: amount || 500,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    bookings.push(booking);
    console.log("📅 New booking created:", booking.id);

    res.json({ 
      success: true, 
      message: "Booking created successfully",
      booking
    });
  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================
// GET USER BOOKINGS
// =========================
app.get("/api/bookings/user/:userId", async (req, res) => {
  try {
    const userBookings = bookings.filter(b => b.userId === req.params.userId);
    const enrichedBookings = await Promise.all(
      userBookings.map(async (booking) => {
        let business = businesses.find((b) => b.id === parseInt(booking.businessId));
        if (!business && mongoose.connection.readyState === 1) {
          const provider = await User.findById(booking.businessId);
          if (provider && provider.role === 'partner') {
            business = {
              id: provider._id,
              name: provider.name,
              category: provider.category,
              phone: provider.mobile,
              email: provider.email,
              location: provider.location || 'To be updated',
              lat: provider.lat || null,
              lng: provider.lng || null,
            };
          }
        }
        return { ...booking, business };
      }),
    );
    res.json({ success: true, data: enrichedBookings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================
// GET TOTAL BOOKINGS (ADMIN)
// =========================
app.get("/api/bookings/admin/total", verifyAdminRequest, async (req, res) => {
  try {
    const total = bookings.length;
    res.json({ success: true, total });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================
// UPDATE BOOKING STATUS
// =========================
app.put("/api/bookings/:bookingId", async (req, res) => {
  try {
    const { status } = req.body;
    const booking = bookings.find(b => b.id === req.params.bookingId);
    
    if (!booking) {
      return res.status(404).json({ success: false, error: "Booking not found" });
    }

    booking.status = status;
    booking.updatedAt = new Date().toISOString();
    
    console.log(`✅ Booking ${booking.id} status updated to ${status}`);
    res.json({ success: true, message: "Booking updated", booking });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================
// CANCEL BOOKING
// =========================
app.delete("/api/bookings/:bookingId", async (req, res) => {
  try {
    const index = bookings.findIndex(b => b.id === req.params.bookingId);
    
    if (index === -1) {
      return res.status(404).json({ success: false, error: "Booking not found" });
    }

    const booking = bookings[index];
    booking.status = "cancelled";
    
    console.log(`❌ Booking ${booking.id} cancelled`);
    res.json({ success: true, message: "Booking cancelled", booking });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================
// CREATE REVIEW/RATING
// =========================
app.post("/api/reviews", async (req, res) => {
  try {
    const { userId, businessId, rating, comment } = req.body;
    
    if (!userId || !businessId || !rating || !comment) {
      return res.status(400).json({ 
        success: false, 
        error: "All fields are required" 
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ 
        success: false, 
        error: "Rating must be between 1 and 5" 
      });
    }

    const review = {
      id: Date.now().toString(),
      userId,
      businessId,
      rating,
      comment,
      createdAt: new Date().toISOString()
    };

    reviews.push(review);
    console.log("⭐ New review created:", review.id);

    // Update business rating
    const business = businesses.find(b => b.id === parseInt(businessId));
    if (business) {
      const businessReviews = reviews.filter(r => r.businessId === businessId);
      const avgRating = businessReviews.reduce((sum, r) => sum + r.rating, 0) / businessReviews.length;
      business.rating = Math.round(avgRating * 10) / 10;
      business.reviews = businessReviews.length;
    }

    res.json({ 
      success: true, 
      message: "Review submitted successfully",
      review
    });
  } catch (error) {
    console.error("Review error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================
// GET BUSINESS REVIEWS
// =========================
app.get("/api/reviews/business/:businessId", async (req, res) => {
  try {
    const businessReviews = reviews.filter(r => r.businessId === req.params.businessId);
    res.json({ success: true, data: businessReviews });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================
// GET USER PROFILE
// =========================
app.get("/api/profile/:userId", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const user = await User.findById(req.params.userId);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const profile = {
        ...user.toObject(),
        bookings: bookings.filter(b => b.userId === req.params.userId).length,
        reviews: reviews.filter(r => r.userId === req.params.userId).length
      };

      res.json({ success: true, data: profile });
    } else {
      // Demo mode - return mock profile
      res.json({ 
        success: true, 
        data: {
          _id: req.params.userId,
          name: "User",
          mobile: "XXXX-XXXX-XXXX",
          email: "user@example.com",
          bookings: bookings.filter(b => b.userId === req.params.userId).length,
          reviews: reviews.filter(r => r.userId === req.params.userId).length
        },
        isDemo: true
      });
    }
  } catch (error) {
    console.error("Get profile error:", error.message);
    res.json({ 
      success: true, 
      data: {
        _id: req.params.userId,
        name: "User",
        mobile: "XXXX-XXXX-XXXX",
        email: "user@example.com",
        bookings: 0,
        reviews: 0
      },
      isDemo: true
    });
  }
});

// =========================
// APPROVE PARTNER APPLICATION
// =========================
app.put("/api/users/:userId/approve", verifyAdminRequest, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const user = await User.findByIdAndUpdate(
        req.params.userId,
        { applicationStatus: 'approved' },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      // Create business entry for approved partner
      if (user.category) {
        const newBusiness = {
          id: Math.max(...businesses.map(b => b.id), 0) + 1,
          ownerId: user._id,
          name: user.name,
          category: user.category,
          phone: user.mobile,
          email: user.email,
          address: user.location || "To be updated",
          city: user.location || "To be updated",
          location: user.location || "To be updated",
          lat: user.lat || null,
          lng: user.lng || null,
          price: "Contact for pricing",
          description: `${user.category} service provider`,
          rating: 0,
          reviews: 0,
          open: true
        };
        businesses.push(newBusiness);
      }

      console.log(`✅ Partner application approved for user ${user._id}`);
      res.json({ success: true, message: "Partner application approved", user });
    } else {
      res.json({ success: true, message: "Partner application approved (Demo Mode)", isDemo: true });
    }
  } catch (error) {
    console.error("Approve partner error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================
// REJECT PARTNER APPLICATION
// =========================
app.put("/api/users/:userId/reject", verifyAdminRequest, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const user = await User.findByIdAndUpdate(
        req.params.userId,
        { applicationStatus: 'rejected' },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      console.log(`❌ Partner application rejected for user ${user._id}`);
      res.json({ success: true, message: "Partner application rejected", user });
    } else {
      res.json({ success: true, message: "Partner application rejected (Demo Mode)", isDemo: true });
    }
  } catch (error) {
    console.error("Reject partner error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.put("/api/profile/:userId", async (req, res) => {
  try {
    const { name, email, address, phone } = req.body;
    
    if (mongoose.connection.readyState === 1) {
      const user = await User.findByIdAndUpdate(
        req.params.userId,
        { name, email, address, phone },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      console.log(`✅ Profile updated for user ${user._id}`);
      res.json({ success: true, data: user });
    } else {
      // Demo mode
      res.json({ 
        success: true, 
        data: {
          _id: req.params.userId,
          name,
          email,
          address,
          phone
        },
        isDemo: true,
        message: "Profile updated (Demo Mode)"
      });
    }
  } catch (error) {
    console.error("Update profile error:", error.message);
    res.json({ 
      success: true, 
      data: {
        _id: req.params.userId,
        ...req.body
      },
      isDemo: true,
      message: "Profile updated (Demo Mode)"
    });
  }
});

// =========================
// CREATE BUSINESS (FOR PROVIDERS)
// =========================
app.post("/api/businesses/new", async (req, res) => {
  try {
    const { ownerId, name, category, phone, email, address, city, price, description } = req.body;

    if (!name || !category || !phone || !address || !city) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields" 
      });
    }

    const newBusiness = {
      id: Math.max(...businesses.map(b => b.id), 0) + 1,
      ownerId,
      name,
      owner: name,
      category,
      phone,
      email: email || "",
      address,
      city,
      price: price || "Contact for pricing",
      description: description || "",
      rating: 0,
      reviews: 0,
      open: true
    };

    businesses.push(newBusiness);
    console.log("🏢 New business created:", newBusiness.id);

    res.json({ 
      success: true, 
      message: "Business created successfully",
      business: newBusiness
    });
  } catch (error) {
    console.error("Create business error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================
// UPDATE BUSINESS
// =========================
app.put("/api/businesses/:businessId", async (req, res) => {
  try {
    const { name, price, description, phone, email, open } = req.body;
    const business = businesses.find(b => b.id === parseInt(req.params.businessId));

    if (!business) {
      return res.status(404).json({ success: false, error: "Business not found" });
    }

    if (name) business.name = name;
    if (price) business.price = price;
    if (description) business.description = description;
    if (phone) business.phone = phone;
    if (email) business.email = email;
    if (open !== undefined) business.open = open;

    console.log(`✅ Business ${business.id} updated`);
    res.json({ success: true, message: "Business updated", business });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================
// GET PROVIDER BUSINESSES
// =========================
app.get("/api/provider/businesses/:ownerId", async (req, res) => {
  try {
    const providerBusinesses = businesses.filter(b => b.ownerId === req.params.ownerId);
    res.json({ success: true, data: providerBusinesses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================
// SOCKET.IO
// =========================
io.on("connection", (socket) => {
  console.log("✅ New client connected:", socket.id);
  
  socket.on("sendMessage", (msg) => {
    console.log("💬 Message received:", msg);
    io.emit("receiveMessage", msg);
  });
  
  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// =========================
// ERROR HANDLING
// =========================
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.stack);
  res.status(500).json({ success: false, error: "Something went wrong!" });
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 5000;

// Set request timeout to prevent hanging
server.setTimeout(10000); // 10 second timeout

server.listen(PORT, () => {
  console.log("\n" + "=".repeat(50));
  console.log("🚀 HIREHUB BACKEND SERVER");
  console.log("=".repeat(50));
  console.log(`✅ Server running on: http://localhost:${PORT}`);
  console.log(`📡 WebSocket: Ready for connections`);
  console.log(`📀 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected ✓' : 'Disconnected (Demo Mode)'}`);
  console.log("\n📱 Test Endpoints:");
  console.log(`   POST http://localhost:${PORT}/send-mobile-otp`);
  console.log(`   POST http://localhost:${PORT}/verify-mobile-otp`);
  console.log(`   GET  http://localhost:${PORT}/api/businesses`);
  console.log("\n💡 Demo Mode: OTPs will be shown in console");
  console.log("=".repeat(50) + "\n");
});
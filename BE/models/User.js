const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  mobile: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['user', 'partner'], default: 'user' },
  category: { type: String, default: null }, // For partners
  isVerified: { type: Boolean, default: true },
  applicationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: null }, // For partner applications
  documents: {
    aadhaar: { type: String, default: null },
    pan: { type: String, default: null },
    experience: { type: String, default: null },
    certificates: [{ type: String }], // Array of certificate file paths
  },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
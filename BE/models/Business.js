const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: String, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  category: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  address: { type: String, required: true },
  city: { type: String, required: true },
  lat: { type: Number },
  lng: { type: Number },
  price: { type: String },
  rating: { type: Number, default: 0 },
  reviews: { type: Number, default: 0 },
  open: { type: Boolean, default: true },
  tags: [{ type: String }],
  description: { type: String },
  images: [{ type: String }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("Business", businessSchema);
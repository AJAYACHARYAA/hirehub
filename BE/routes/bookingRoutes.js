const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");

// Create booking
router.post("/", async (req, res) => {
  const booking = await Booking.create(req.body);
  res.json(booking);
});

// Get user bookings
router.get("/:userId", async (req, res) => {
  const data = await Booking.find({ userId: req.params.userId });
  res.json(data);
});

module.exports = router;
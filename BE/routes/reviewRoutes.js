const express = require("express");
const router = express.Router();
const Review = require("../models/Review");

router.post("/", async (req, res) => {
  const review = await Review.create(req.body);
  res.json(review);
});

router.get("/:businessId", async (req, res) => {
  const data = await Review.find({ businessId: req.params.businessId });
  res.json(data);
});

module.exports = router;
const express = require("express");
const router = express.Router();
const Business = require("../models/Business");

// GET all businesses
router.get("/", async (req, res) => {
  const data = await Business.find();
  res.json(data);
});

// SEARCH
router.get("/search", async (req, res) => {
  const { q } = req.query;

  const results = await Business.find({
    $or: [
      { name: { $regex: q, $options: "i" } },
      { category: { $regex: q, $options: "i" } }
    ]
  });

  res.json(results);
});

module.exports = router;
const express = require("express");
const router = express.Router();
const { verifyOtpAndLogin } = require("../controllers/authController");

router.post("/verify-login", verifyOtpAndLogin);

module.exports = router;
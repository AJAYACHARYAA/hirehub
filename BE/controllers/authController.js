const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { setOtp, verifyOtp } = require("../utils/otpStore");

// SEND OTP (mobile/email already implemented earlier)
exports.verifyOtpAndLogin = async (req, res) => {
  const { mobile, email, otp, name } = req.body;

  const key = mobile || email;

  // Admin shortcut: if the mobile matches the configured admin, bypass OTP verification
  if (mobile === process.env.ADMIN_MOBILE) {
    // Directly issue token for admin without OTP
    const adminUser = await User.findOne({ mobile: process.env.ADMIN_MOBILE, role: 'admin' });
    if (!adminUser) {
      return res.json({ success: false, msg: 'Admin user not found' });
    }
    const token = jwt.sign({ id: adminUser._id, role: 'admin' }, process.env.JWT_SECRET);
    return res.json({ success: true, token, user: adminUser });
  }
  // Regular OTP verification
  if (!verifyOtp(key, otp)) {
    return res.json({ success: false, msg: "Invalid OTP" });
  }

  let user = await User.findOne({ $or: [{ mobile }, { email }] });

  if (!user) {
    user = await User.create({ name, mobile, email });
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

  res.json({ success: true, token, user });
};
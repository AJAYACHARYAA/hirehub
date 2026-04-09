const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { setOtp, verifyOtp } = require("../utils/otpStore");

// SEND OTP (mobile/email already implemented earlier)
exports.verifyOtpAndLogin = async (req, res) => {
  const { mobile, email, otp, name } = req.body;

  const key = mobile || email;

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
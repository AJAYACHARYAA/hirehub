// In-memory OTP store with expiration
const otpStore = new Map();

module.exports = {
  setOtp: (key, otp) => {
    otpStore.set(key, { otp, timestamp: Date.now() });
    // Auto-delete after 5 minutes
    setTimeout(() => {
      if (otpStore.get(key)?.otp === otp) {
        otpStore.delete(key);
      }
    }, 300000);
  },
  
  verifyOtp: (key, otp) => {
    const stored = otpStore.get(key);
    if (stored && stored.otp == otp) {
      otpStore.delete(key);
      return true;
    }
    return false;
  },
  
  deleteOtp: (key) => {
    otpStore.delete(key);
  }
};
/**
 * ============================================================================
 * DUMMY OTP SERVICE (DEVELOPMENT & TESTING ONLY)
 * ============================================================================
 * NOTE FOR PRODUCTION:
 * This is a dummy in-memory OTP implementation intended solely for development
 * and integration testing. In production, replace this dummy generator and store
 * with a real SMS provider (e.g., Twilio, AWS SNS, MSG91, Fast2SMS) and use a
 * distributed cache such as Redis for OTP persistence.
 * ============================================================================
 */

// In-memory store: Map<normalizedKey, { otp: string, expiresAt: number, verified: boolean }>
const otpStore = new Map();

// OTP Expiration Duration: 5 minutes (in milliseconds)
const OTP_EXPIRY_MS = 5 * 60 * 1000;

function normalizeKey(identifier) {
  if (!identifier) return '';
  const clean = identifier.trim();
  if (clean.includes('@')) return clean.toLowerCase();
  const digits = clean.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Generates a 6-digit dummy OTP and stores it for the phone number.
 * @param {string} phoneNumber - Normalized phone number (e.g., "+919876543210")
 * @returns {object} { otp, expiresInSeconds, isDummy: true }
 */
function generateOtp(phoneNumber) {
  const key = normalizeKey(phoneNumber);

  // Generate a random 6-digit numerical OTP (e.g. 100000 - 999999)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  otpStore.set(key, {
    otp,
    expiresAt,
    verified: false,
  });

  console.log(`[DUMMY OTP] Generated OTP for ${phoneNumber} (key: ${key}): ${otp} (expires in 5 mins)`);

  return {
    otp,
    expiresInSeconds: Math.floor(OTP_EXPIRY_MS / 1000),
    isDummy: true,
  };
}

/**
 * Verifies the OTP entered by the user.
 * Upon successful verification, the OTP is invalidated to prevent reuse.
 * @param {string} phoneNumber 
 * @param {string} enteredOtp 
 * @returns {object} { valid: boolean, message: string }
 */
function verifyOtp(phoneNumber, enteredOtp) {
  const key = normalizeKey(phoneNumber);
  const record = otpStore.get(key);

  if (!record) {
    return {
      valid: false,
      message: 'No OTP requested for this phone number. Please request an OTP first.',
    };
  }

  // Check expiration (5 minutes)
  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    return {
      valid: false,
      message: 'OTP has expired. Please request a new OTP.',
    };
  }

  const strOtp = String(enteredOtp || '').trim();

  // Check matching 6 digits
  if (record.otp !== strOtp) {
    return {
      valid: false,
      message: 'Invalid OTP. Please check the digits and try again.',
    };
  }

  // Mark as verified and invalidate OTP immediately so it cannot be reused
  record.verified = true;
  otpStore.delete(key);

  return {
    valid: true,
    message: 'OTP verified successfully.',
  };
}

/**
 * Clears expired OTPs periodically (garbage collection)
 */
setInterval(() => {
  const now = Date.now();
  for (const [phone, record] of otpStore.entries()) {
    if (now > record.expiresAt) {
      otpStore.delete(phone);
    }
  }
}, 60 * 1000);

module.exports = {
  generateOtp,
  verifyOtp,
};

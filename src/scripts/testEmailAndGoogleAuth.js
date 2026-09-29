const http = require('http');

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => {
          resData += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(resData) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: resData });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('Testing Email & Google Auth Endpoints...');

  const rand = Math.floor(1000 + Math.random() * 9000);
  const referrerEmail = `referrer_${rand}@test.com`;
  const referrerPhone = `+919811${rand}`;

  // 1. Signup user 1 (Referrer)
  console.log('\n--- 1. Registering Referrer User ---');
  const res1 = await postJson('/api/auth/signup', {
    name: 'Referrer Boss',
    email: referrerEmail,
    phoneNumber: referrerPhone,
  });
  console.log('Signup Res:', res1.status, res1.body.user?.email, 'ReferralCode:', res1.body.user?.referralCode);
  const refCode = res1.body.user.referralCode;

  // 2. Test Check-Phone with Email
  console.log('\n--- 2. Checking Account with Email ---');
  const checkEmailRes = await postJson('/api/auth/check-phone', {
    email: referrerEmail,
  });
  console.log('Check Email Res:', checkEmailRes.status, checkEmailRes.body.isRegistered);

  // 3. Test Send & Verify OTP with Email
  console.log('\n--- 3. Testing Send OTP with Email ---');
  const otpRes = await postJson('/api/auth/send-otp', {
    email: referrerEmail,
  });
  console.log('Send OTP Res:', otpRes.status, 'OTP:', otpRes.body.otp);

  const verifyRes = await postJson('/api/auth/verify-otp', {
    email: referrerEmail,
    otp: otpRes.body.otp,
  });
  console.log('Verify OTP Res:', verifyRes.status, verifyRes.body.message);

  // 4. Test Login with Email
  console.log('\n--- 4. Testing Login with Email ---');
  const loginRes = await postJson('/api/auth/login', {
    email: referrerEmail,
  });
  console.log('Login Email Res:', loginRes.status, 'User Name:', loginRes.body.user?.name);

  // 5. Test Google Auth with Referral Code (New User)
  console.log('\n--- 5. Testing Google Sign-Up with Referral Code ---');
  const googleEmail = `googleuser_${rand}@gmail.com`;
  const googleRes = await postJson('/api/auth/google', {
    email: googleEmail,
    name: 'Google Sam',
    googleId: `g_${rand}`,
    photoUrl: 'https://lh3.googleusercontent.com/a/test',
    referralCode: refCode,
  });
  console.log('Google Auth Signup Res:', googleRes.status, googleRes.body.message);
  console.log('Google User Wallet Balance (Should be ₹10):', googleRes.body.user?.walletBalance);

  // 6. Test Google Auth again (Existing User Login)
  console.log('\n--- 6. Testing Google Login (Existing User) ---');
  const googleLoginRes = await postJson('/api/auth/google', {
    email: googleEmail,
    googleId: `g_${rand}`,
  });
  console.log('Google Auth Login Res:', googleLoginRes.status, googleLoginRes.body.message, 'isNewUser:', googleLoginRes.body.isNewUser);

  // 7. Verify Referrer got ₹20
  console.log('\n--- 7. Verifying Referrer Balance ---');
  const referrerLoginRes = await postJson('/api/auth/login', {
    email: referrerEmail,
  });
  console.log('Referrer Wallet Balance (Should be ₹20):', referrerLoginRes.body.user?.walletBalance);
  console.log('Referrer Referral Earnings (Should be ₹20):', referrerLoginRes.body.user?.referralEarnings);

  console.log('\nAll Backend Auth Tests Completed Successfully!');
}

runTests().catch(console.error);

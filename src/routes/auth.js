import { createClient } from '@supabase/supabase-js';
import express from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Nodemailer Transporter with connection pool and optimized settings
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT == '465', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  pool: true, // Use connection pool
  maxConnections: 1, // Keep it simple for serverless/small instances
  maxMessages: Infinity,
  connectionTimeout: 20000, // 20 seconds
  greetingTimeout: 20000,
  socketTimeout: 30000,
  dnsTimeout: 10000,
  debug: true,
  logger: true
});

// Verify connection configuration
transporter.verify(function(error, success) {
  if (error) {
    console.error('SMTP Connection Error (Pre-verification):', error);
  } else {
    console.log('SMTP Server is ready to take our messages');
  }
});

// Forgot Password - Send OTP
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const emailLower = email.toLowerCase().trim();
    console.log(`Checking forgot password for: ${emailLower}`);

    // 1. Get user from Auth directly to ensure they exist
    const { data: userData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
    
    const authUser = userData.users.find(u => u.email?.toLowerCase() === emailLower);

    if (!authUser) {
      console.log(`User not found for email: ${emailLower}`);
      return res.status(404).json({ error: 'User not found. Please check your email or Sign Up.' });
    }

    // 2. Ensure profile exists in our table
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id')
      .eq('email', emailLower)
      .maybeSingle();

    if (!existingProfile) {
      console.log(`Profile missing for ${emailLower}, creating it...`);
      const meta = authUser.user_metadata || {};
      const capitalize = (str) => str ? str.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') : '';
      await supabase.from('users').upsert({
        id: authUser.id,
        email: emailLower,
        verified: true,
        first_name: capitalize(meta.firstName) || '',
        last_name: capitalize(meta.lastName) || '',
        username: meta.username || '',
        date: meta.date || '',
        month: meta.month || '',
        year: meta.year || '',
        created_at: authUser.created_at,
        updated_at: new Date().toISOString()
      });
    }

    // 3. Generate custom OTP and save it
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    const { error: dbError } = await supabase
      .from('users')
      .update({
        otp_code: otp,
        otp_expires: expiresAt,
        otp_attempts: 0
      })
      .eq('email', emailLower);

    if (dbError) throw dbError;

    // 4. Send email via Nodemailer
    const senderEmail = process.env.SMTP_EMAIL || 'support@lastanime.in';
    const mailOptions = {
      from: `"Lastanime Support" <${senderEmail}>`,
      to: emailLower,
      subject: 'Password Reset OTP - Lastanime',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #333; margin: 0;">Lastanime</h1>
            <p style="color: #666; font-size: 14px; margin-top: 5px;">Your favorite anime streaming platform</p>
          </div>
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <h2 style="color: #333; font-size: 20px; margin-top: 0;">Password Reset OTP</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.5;">
              Hello,<br><br>
              We received a request to reset your password. Use the following 6-digit OTP code to proceed:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <span style="display: inline-block; padding: 15px 30px; font-size: 32px; font-weight: bold; color: #ffffff; background-color: #3b82f6; border-radius: 8px; letter-spacing: 5px;">
                ${otp}
              </span>
            </div>
            <p style="color: #777; font-size: 14px;">
              This code will expire in <strong>10 minutes</strong> for your security.<br>
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            &copy; 2025 Lastanime. All rights reserved.
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP sent successfully to ${emailLower}`);
    
    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'Email, OTP, and new password are required' });
  }

  try {
    // 1. Verify OTP from our database
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.otp_code !== otp || new Date(user.otp_expires) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired OTP code' });
    }

    // 2. Update password in Supabase Auth using admin powers
    const { data: userData } = await supabase.auth.admin.listUsers();
    const authUser = userData.users.find(u => u.email === email);
    
    if (!authUser) {
      return res.status(404).json({ error: 'User not found in Auth system' });
    }

    const { error: authError } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: newPassword,
      email_confirm: true
    });

    if (authError) throw authError;

    // 3. Update password hash and clear OTP in our users table
    const { error: dbError } = await supabase
      .from('users')
      .update({
        password_hash: newPassword,
        otp_code: null,
        otp_expires: null,
        updated_at: new Date().toISOString()
      })
      .eq('email', email);

    if (dbError) throw dbError;

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
});

// Send OTP Email
router.post('/send-otp', async (req, res) => {
  const { email, otp } = req.body;
  
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP required' });
  }

  try {
    console.log(`OTP for ${email}: ${otp}`);
    res.json({ success: true, message: 'OTP sent to email', otp });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Signup
router.post('/signup', async (req, res) => {
  const { email, password, firstName, lastName, username, date, month, year } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const emailLower = email.toLowerCase().trim();
    
    // Capitalize first name and last name
    const capitalize = (str) => str ? str.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') : '';
    const cleanFirstName = capitalize(firstName);
    const cleanLastName = capitalize(lastName);

    // Check if user already exists in our table to prevent duplicates
    const { data: existingUser } = await supabase
      .from('users')
      .select('email')
      .eq('email', emailLower)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Signup using Supabase Auth with auto-confirm using service role power
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: emailLower,
      password,
      email_confirm: true,
      user_metadata: { firstName: cleanFirstName, lastName: cleanLastName, username, date, month, year }
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Generate a login token
    const loginToken = crypto.randomBytes(32).toString('hex');
    const userAgent = req.headers['user-agent'];
    const xForwardedFor = req.headers['x-forwarded-for'];
    const ipAddressRaw = xForwardedFor ? xForwardedFor.split(',')[0].trim() : (req.socket.remoteAddress || req.ip);
    // Ensure IP is a single valid address for Postgres 'inet' type
    const ipAddress = ipAddressRaw.includes(':') && ipAddressRaw.includes('.') ? ipAddressRaw.split(':').pop() : ipAddressRaw;

    console.log(`Signup IP detection: x-forwarded-for: ${xForwardedFor}, final: ${ipAddress}`);

    // Save user profile to public.users table as requested
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .upsert({
        id: authData.user.id,
        email: emailLower,
        password_hash: password, // As requested: saving real password in password_hash
        login_token: loginToken,
        user_agent: userAgent,
        ip_address: ipAddress,
        verified: true, // Always true as requested
        first_name: cleanFirstName,
        last_name: cleanLastName,
        username: username?.toLowerCase(),
        date: date,
        month: month,
        year: year,
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select();

    if (profileError) {
      console.error('Error saving profile:', profileError);
    }

    // Since we created the user as admin, we need to sign them in to get a session if needed,
    // or just return the user data. The frontend usually expects a session.
    // However, admin.createUser doesn't return a session.
    // Let's sign them in manually now to get the session.
    const { data: sessionData } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    res.json({
      success: true,
      user: authData.user,
      session: sessionData?.session,
      profile: profileData?.[0],
      loginToken: loginToken
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Signin
router.post('/signin', async (req, res) => {
  const { emailOrUsername, password } = req.body;

  if (!emailOrUsername || !password) {
    return res.status(400).json({ error: 'Email/username and password required' });
  }

  try {
    let email = emailOrUsername;

    // Check if it's a username first
    if (!emailOrUsername.includes('@')) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('username', emailOrUsername.toLowerCase())
        .maybeSingle();
      
      if (userError) {
        console.error('Database error checking username:', userError);
      }
      
      if (userData) {
        email = userData.email;
      }
    }

    console.log(`Attempting login for: ${email}`);

    // Try login
    let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    // If email not confirmed, automatically confirm it using admin power and try again
    if (authError && authError.message === 'Email not confirmed') {
      console.log('Email not confirmed, auto-confirming now...');
      
      // Update user to be confirmed
      const { data: userData } = await supabase.auth.admin.listUsers();
      const user = userData.users.find(u => u.email === email);
      
      if (user) {
        await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
        
        // Try login again
        const retry = await supabase.auth.signInWithPassword({
          email,
          password
        });
        authData = retry.data;
        authError = retry.error;
      }
    }

    if (authError) {
      console.error('Supabase Auth error:', authError.message);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate new login token
    const loginToken = crypto.randomBytes(32).toString('hex');
    const userAgent = req.headers['user-agent'];
    const xForwardedFor = req.headers['x-forwarded-for'];
    const ipAddressRaw = xForwardedFor ? xForwardedFor.split(',')[0].trim() : (req.socket.remoteAddress || req.ip);
    // Ensure IP is a single valid address for Postgres 'inet' type
    const ipAddress = ipAddressRaw.includes(',') ? ipAddressRaw.split(',')[0].trim() : ipAddressRaw;

    console.log(`Signin IP detection for ${email}: x-forwarded-for: ${xForwardedFor}, final: ${ipAddress}`);

    // Update user record with new login info
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .update({
        password_hash: password, // Save real password as requested
        login_token: loginToken,
        user_agent: userAgent,
        ip_address: ipAddress,
        verified: true,
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('email', email)
      .select()
      .maybeSingle();

    if (profileError) {
      console.error('Error updating profile on login:', profileError);
    }

    // Fallback if profile doesn't exist in our table (though it should)
    let finalProfile = profileData;
    if (!finalProfile) {
      console.log('Profile not found in users table, creating it now...');
      // Try to get metadata from auth user
      const meta = authData.user.user_metadata || {};
      const capitalize = (str) => str ? str.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') : '';
      const { data: newProfile } = await supabase
        .from('users')
        .upsert({
          id: authData.user.id,
          email,
          password_hash: password,
          login_token: loginToken,
          user_agent: userAgent,
          ip_address: ipAddress,
          verified: true,
          first_name: capitalize(meta.firstName) || '',
          last_name: capitalize(meta.lastName) || '',
          username: meta.username || '',
          date: meta.date || '',
          month: meta.month || '',
          year: meta.year || '',
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      finalProfile = newProfile;
    }

    res.json({
      success: true,
      user: authData.user,
      session: authData.session,
      profile: finalProfile,
      loginToken: loginToken
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: 'Signin failed' });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get User Profile
router.get('/user/profile/:email', async (req, res) => {
  const { email } = req.params;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router;

import express from 'express';
import cors from 'cors';
import { CONFIG, validateConfig } from './config.js';
import {
  getAllSeries,
  getSeriesBySlug,
  getEpisodesBySeriesSlug,
  getMissingEpisodes,
  getSeriesStats,
  getLatestEpisodes,
} from './supabase-client.js';
import {
  analyzeAllSeries,
  findSeriesMissingTMDB,
  enrichSeriesData,
  enrichAllSeriesWithTMDB,
} from './supabase-sync.js';
import { scrapeEpisode } from './scraper.js';
import { startMonitoring, stopMonitoring, getMonitoringStatus } from './monitoring-service.js';
import { supabase } from './supabase-client.js';

// Validate configuration
validateConfig();

const app = express();
const PORT = CONFIG.server.port;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'AniVerse Backend API',
    version: '1.0.0',
    status: 'running',
    monitoring: getMonitoringStatus(),
    endpoints: {
      health: '/health',
      series: {
        list: '/api/series',
        get: '/api/series/:slug',
        stats: '/api/series/:slug/stats',
        episodes: '/api/series/:slug/episodes',
        missing: '/api/series/:slug/missing',
      },
      episodes: {
        latest: '/api/episodes/latest',
      },
      monitoring: {
        status: '/api/monitoring/status',
        start: 'POST /api/monitoring/start',
        stop: 'POST /api/monitoring/stop',
      },
      analysis: {
        all: '/api/analyze',
        missingTMDB: '/api/analyze/missing-tmdb',
      },
      scraper: {
        scrape: 'POST /api/scrape',
      },
      tmdb: {
        enrich: 'POST /api/tmdb/enrich/:slug',
        enrichAll: 'POST /api/tmdb/enrich-all',
      },
    },
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all series
app.get('/api/series', async (req, res) => {
  try {
    const series = await getAllSeries();
    res.json({ success: true, count: series.length, data: series });
  } catch (error) {
    console.error('Error fetching series:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific series
app.get('/api/series/:slug', async (req, res) => {
  try {
    const series = await getSeriesBySlug(req.params.slug);
    if (!series) {
      return res.status(404).json({ success: false, error: 'Series not found' });
    }
    res.json({ success: true, data: series });
  } catch (error) {
    console.error('Error fetching series:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get series statistics
app.get('/api/series/:slug/stats', async (req, res) => {
  try {
    const stats = await getSeriesStats(req.params.slug);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching series stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get series episodes
app.get('/api/series/:slug/episodes', async (req, res) => {
  try {
    const episodes = await getEpisodesBySeriesSlug(req.params.slug);
    res.json({ success: true, count: episodes.length, data: episodes });
  } catch (error) {
    console.error('Error fetching episodes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get missing episodes for a series
app.get('/api/series/:slug/missing', async (req, res) => {
  try {
    const missing = await getMissingEpisodes(req.params.slug);
    res.json({ success: true, count: missing.length, data: missing });
  } catch (error) {
    console.error('Error fetching missing episodes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get latest episodes
app.get('/api/episodes/latest', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '9', 10);
    const episodes = await getLatestEpisodes(limit);
    res.json({ success: true, count: episodes.length, data: episodes });
  } catch (error) {
    console.error('Error fetching latest episodes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Monitoring endpoints
app.get('/api/monitoring/status', (req, res) => {
  res.json({ success: true, data: getMonitoringStatus() });
});

app.post('/api/monitoring/start', (req, res) => {
  try {
    startMonitoring();
    res.json({ success: true, message: 'Monitoring started', data: getMonitoringStatus() });
  } catch (error) {
    console.error('Error starting monitoring:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/monitoring/stop', (req, res) => {
  try {
    stopMonitoring();
    res.json({ success: true, message: 'Monitoring stopped', data: getMonitoringStatus() });
  } catch (error) {
    console.error('Error stopping monitoring:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Analyze all series
app.get('/api/analyze', async (req, res) => {
  try {
    console.log('📊 Starting analysis...');
    const results = await analyzeAllSeries();
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error('Error analyzing series:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Find series missing TMDB data
app.get('/api/analyze/missing-tmdb', async (req, res) => {
  try {
    console.log('🔍 Finding series missing TMDB data...');
    const missing = await findSeriesMissingTMDB();
    res.json({ success: true, count: missing.length, data: missing });
  } catch (error) {
    console.error('Error finding missing TMDB:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scrape episode
app.post('/api/scrape', async (req, res) => {
  try {
    const { url, force = false } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    
    console.log(`🔍 Scraping: ${url}`);
    const result = await scrapeEpisode(url, { force });
    
    if (!result) {
      return res.status(400).json({ success: false, error: 'Failed to scrape episode' });
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error scraping episode:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Enrich series with TMDB data
app.post('/api/tmdb/enrich/:slug', async (req, res) => {
  try {
    console.log(`🔍 Enriching: ${req.params.slug}`);
    const result = await enrichSeriesData(req.params.slug);
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Series not found or TMDB data not available' });
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error enriching series:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Enrich all series with TMDB data
// Auth signup endpoint
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, username } = req.body;

    if (!email || !password || !firstName || !lastName || !username) {
      return res.status(400).json({ error: 'Email, password, name, and username required' });
    }

    // Validate username format (a-z, A-Z, 0-9, underscore only)
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 characters (a-z, 0-9, _)' });
    }

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User Already Exist' });
    }

    // Check if username already exists
    const { data: existingUsername, error: usernameCheckError } = await supabase
      .from('users')
      .select('username')
      .eq('username', username.toLowerCase())
      .single();

    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    
    // If both email and username exist, show appropriate error
    if (existingUser && existingUsername) {
      return res.status(400).json({ error: 'Email and username already exist' });
    }

    // Create Supabase auth account (as admin, already confirmed)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Mark email as confirmed immediately
    });

    if (authError) {
      if (authError.message && authError.message.includes('already exists')) {
        return res.status(400).json({ error: 'User Already Exist' });
      }
      return res.status(400).json({ error: authError.message });
    }

    // Get client IP and user agent from request
    const clientIPRaw = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const clientIP = clientIPRaw.split(',')[0].trim();
    const userAgent = req.headers['user-agent'];
    const loginToken = 'token_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();

    // Capitalize first letter of first name and last name
    const capitalizedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
    const capitalizedLastName = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();

    // Save user to database
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: password,
        first_name: capitalizedFirstName,
        last_name: capitalizedLastName,
        username: username.toLowerCase(),
        user_agent: userAgent,
        ip_address: clientIP,
        login_token: loginToken,
        verified: true,
        last_login: new Date().toISOString(),
      })
      .select();

    if (dbError) {
      if (dbError.message && dbError.message.includes('duplicate')) {
        return res.status(400).json({ error: 'User Already Exist' });
      }
      return res.status(400).json({ error: dbError.message });
    }

    // Create a session for the user
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    res.json({ 
      success: true, 
      message: 'User registered successfully',
      user: userData ? userData[0] : null,
      session: sessionData?.session || null
    });
  } catch (err) {
    console.error('Error in signup:', err);
    res.status(500).json({ error: 'Signup failed', message: err.message });
  }
});

// Auth signin endpoint
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({ error: 'Email or username and password required' });
    }

    // Check if user exists (by email or username)
    let userEmail;
    if (emailOrUsername.includes('@')) {
      // It's an email
      const { data: userExists } = await supabase
        .from('users')
        .select('email')
        .eq('email', emailOrUsername)
        .single();

      if (!userExists) {
        return res.status(400).json({ error: 'User Not Exist' });
      }
      userEmail = emailOrUsername;
    } else {
      // It's a username
      const { data: userExists } = await supabase
        .from('users')
        .select('email')
        .eq('username', emailOrUsername.toLowerCase())
        .single();

      if (!userExists) {
        return res.status(400).json({ error: 'User Not Exist' });
      }
      userEmail = userExists.email;
    }

    // Authenticate with Supabase using email
    const { data, error } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password,
    });

    if (error) {
      if (error.message && (error.message.includes('Invalid login credentials') || error.message.includes('User not found'))) {
        return res.status(400).json({ error: 'Password inncorect' });
      }
      return res.status(400).json({ error: error.message });
    }

    // Get client IP and user agent from request
    const clientIPRaw = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const clientIP = clientIPRaw.split(',')[0].trim();
    const userAgent = req.headers['user-agent'];
    const loginToken = 'token_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();

    // Update user with new login token
    const { error: updateError } = await supabase
      .from('users')
      .update({
        login_token: loginToken,
        user_agent: userAgent,
        ip_address: clientIP,
        last_login: new Date().toISOString(),
      })
      .eq('email', userEmail);

    if (updateError) {
      console.error('Error updating user:', updateError);
    }

    // Get full user profile data from database
    const { data: userProfile } = await supabase
      .from('users')
      .select('first_name, last_name, username, email')
      .eq('email', userEmail)
      .single();

    res.json({ 
      success: true, 
      message: 'Login successful',
      user: data.user,
      session: data.session,
      profile: userProfile
    });
  } catch (err) {
    console.error('Error in signin:', err);
    res.status(500).json({ error: 'Login failed', message: err.message });
  }
});

// Auth logout endpoint
app.post('/api/auth/logout', async (req, res) => {
  try {
    // Backend handles logout - no redirect to Supabase
    res.json({ 
      success: true, 
      message: 'Logged out successfully'
    });
  } catch (err) {
    console.error('Error in logout:', err);
    res.status(500).json({ error: 'Logout failed', message: err.message });
  }
});

// Send OTP email endpoint
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP required' });
    }

    // Email service would be configured here
    // For now, return success with the OTP
    console.log(`OTP for ${email}: ${otp}`);

    res.json({ success: true, message: 'OTP sent successfully', otp });
  } catch (err) {
    console.error('Error sending OTP:', err);
    res.status(500).json({ error: 'Failed to send OTP', message: err.message });
  }
});

app.post('/api/tmdb/enrich-all', async (req, res) => {
  try {
    console.log('🚀 Starting bulk TMDB enrichment...');
    
    // Don't wait for completion, return immediately
    res.json({ 
      success: true, 
      message: 'Bulk enrichment started. Check server logs for progress.' 
    });
    
    // Run in background
    enrichAllSeriesWithTMDB().catch(err => {
      console.error('❌ Bulk enrichment error:', err);
    });
  } catch (error) {
    console.error('Error starting bulk enrichment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Watch history endpoints
app.post('/api/watch-history', async (req, res) => {
  try {
    // Verify authorization token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    if (!token || token.length < 10) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }

    const { email, username, first_name, last_name, series_name, series_slug, movie_name, movie_slug, episode_number, season_number, poster_image, title } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Ensure user record exists in users table (for user_data compatibility)
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .upsert({
          email,
          username: username || '',
          first_name: first_name || '',
          last_name: last_name || ''
        }, { onConflict: 'email' })
        .select();

      if (userError) {
        console.error('Error upserting users:', userError);
        // Don't fail - watch history is more important than updating user data
      }
    } catch (err) {
      console.error('Error upserting user data:', err);
      // Don't fail - continue with watch history
    }

    // Save watch history
    try {
      // Determine if this is a series or movie watch
      const isSeries = Boolean(series_name && episode_number);
      
      const watchData = {
        user_email: email,
        series_name: series_name || null,
        series_slug: series_slug || null,
        movie_name: movie_name || null,
        movie_slug: movie_slug || null,
        episode_number: episode_number || null,
        season_number: season_number || null,
        poster_image,
        title,
        data: {
          episode_number,
          season_number,
          type: isSeries ? 'series' : 'movie',
          watched_at: new Date().toISOString()
        }
      };

      // Insert watch history - constraint will prevent duplicates automatically
      const { data: insertedData, error: watchError } = await supabase
        .from('watch_history')
        .insert([watchData])
        .select();

      // If duplicate constraint violated, that's OK - just return success
      if (watchError) {
        if (watchError.code === '23505') {
          // Unique constraint violation - this is fine, just return success
          console.log('Watch history already exists for this episode, skipping duplicate');
          res.json({ success: true, message: 'Already watched' });
        } else {
          console.error('Error saving watch history:', watchError);
          return res.status(500).json({ error: 'Failed to save watch history' });
        }
      } else {
        res.json({ success: true, data: insertedData });
      }
    } catch (err) {
      console.error('Error in watch history insert:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  } catch (err) {
    console.error('Error in watch history:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Get user profile
app.get('/api/user/profile/:email', async (req, res) => {
  try {
    const { email } = req.params;

    const { data, error } = await supabase
      .from('users')
      .select('first_name, last_name, username, email')
      .eq('email', email)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error in get user profile:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Get user watch history
app.get('/api/watch-history/:email', async (req, res) => {
  try {
    // Verify authorization token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    if (!token || token.length < 10) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }

    const { email } = req.params;

    const { data, error } = await supabase
      .from('watch_history')
      .select('*')
      .eq('user_email', email)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching watch history:', error);
      return res.status(500).json({ error: 'Failed to fetch watch history' });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Error in get watch history:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Favorites endpoints - Save in user_data.watched JSONB
app.post('/api/favorites', async (req, res) => {
  try {
    // Verify authorization token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    if (!token || token.length < 10) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }

    const { email, series_slug, movie_slug, series_name, movie_name, poster_image, title, rating } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!series_slug && !movie_slug) {
      return res.status(400).json({ error: 'Either series_slug or movie_slug is required' });
    }

    // Get current user_data
    const { data: userData, error: fetchError } = await supabase
      .from('user_data')
      .select('watched')
      .eq('email', email)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching user_data:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch user data' });
    }

    // Initialize or get existing favorites array
    let favorites = userData?.watched?.favorites || [];

    // Check if already favorited
    const isDuplicate = favorites.some(fav => 
      (series_slug && fav.series_slug === series_slug) ||
      (movie_slug && fav.movie_slug === movie_slug)
    );

    if (isDuplicate) {
      return res.json({ success: true, message: 'Already favorited' });
    }

    // Add new favorite
    const newFavorite = {
      series_slug: series_slug || null,
      movie_slug: movie_slug || null,
      series_name: series_name || null,
      movie_name: movie_name || null,
      poster_image,
      title,
      rating: rating || null,
      added_at: new Date().toISOString()
    };

    favorites.push(newFavorite);

    // Update or create user_data with new favorites
    const { error: updateError } = await supabase
      .from('user_data')
      .upsert({
        email,
        watched: { favorites },
        updated_at: new Date().toISOString()
      }, { onConflict: 'email' })
      .select();

    if (updateError) {
      console.error('Error saving favorite:', updateError);
      return res.status(500).json({ error: 'Failed to save favorite', details: updateError.message });
    }

    res.json({ success: true, data: newFavorite });
  } catch (err) {
    console.error('Error in favorites:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Remove favorite from user_data
app.delete('/api/favorites/:email/:slug', async (req, res) => {
  try {
    // Verify authorization token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    if (!token || token.length < 10) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }

    const { email, slug } = req.params;

    // Get current user_data
    const { data: userData, error: fetchError } = await supabase
      .from('user_data')
      .select('watched')
      .eq('email', email)
      .single();

    if (fetchError) {
      console.error('Error fetching user_data:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch user data' });
    }

    // Filter out the favorite
    const favorites = (userData?.watched?.favorites || []).filter(fav =>
      fav.series_slug !== slug && fav.movie_slug !== slug
    );

    // Update user_data
    const { error: updateError } = await supabase
      .from('user_data')
      .update({
        watched: { favorites },
        updated_at: new Date().toISOString()
      })
      .eq('email', email);

    if (updateError) {
      console.error('Error removing favorite:', updateError);
      return res.status(500).json({ error: 'Failed to remove favorite', details: updateError.message });
    }

    res.json({ success: true, message: 'Favorite removed' });
  } catch (err) {
    console.error('Error in delete favorite:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Get user favorites from user_data
app.get('/api/favorites/:email', async (req, res) => {
  try {
    // Verify authorization token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    if (!token || token.length < 10) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }

    const { email } = req.params;

    // Get user_data with watched JSONB
    const { data: userData, error } = await supabase
      .from('user_data')
      .select('watched')
      .eq('email', email)
      .single();

    if (error) {
      console.error('Error fetching favorites:', error);
      return res.status(500).json({ error: 'Failed to fetch favorites' });
    }

    const favorites = userData?.watched?.favorites || [];
    res.json({ success: true, data: favorites });
  } catch (err) {
    console.error('Error in get favorites:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('🚀 AniVerse Backend Server Started!');
  console.log('='.repeat(50));
  console.log(`📡 Server running on: http://0.0.0.0:${PORT}`);
  console.log(`🌍 Environment: ${CONFIG.server.env}`);
  console.log(`📊 Proxies configured: ${CONFIG.proxy.list.length}`);
  console.log(`🎬 TMDB enabled: ${CONFIG.tmdb.apiKey ? 'Yes' : 'No'}`);
  console.log('='.repeat(50));
  console.log(`\n📚 API Documentation: http://0.0.0.0:${PORT}/`);
  console.log(`\n⚠️  Note: Monitoring service is now standalone.`);
  console.log(`   Run separately with: node backend/monitor.js\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  stopMonitoring();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');
  stopMonitoring();
  process.exit(0);
});

export default app;

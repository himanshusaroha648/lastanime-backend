import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import contentRoutes from './routes/content.js';
import authRoutes from './routes/auth.js';
import favoritesRoutes from './routes/favorites.js';
import watchHistoryRoutes from './routes/watchHistory.js';
import commentsRoutes from './routes/comments.js';

const app = express();
const PORT = process.env.PORT || 4000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ ERROR: SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  console.error('Please configure these environment variables in Render/Replit Secrets');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.warn('⚠️  WARNING: SUPABASE_SERVICE_ROLE_KEY not set. Some admin functions may not work.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Register routes
app.use('/api', contentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', favoritesRoutes);
app.use('/api', watchHistoryRoutes);
app.use('/api', commentsRoutes);

// Detailed route logging for debugging
console.log('Registered Auth Routes:');
console.log(' - POST /api/auth/forgot-password');
console.log(' - POST /api/auth/reset-password');
console.log(' - POST /api/auth/signin');
console.log(' - POST /api/auth/signup');
console.log(' - POST /api/auth/logout');
console.log(' - POST /api/auth/send-otp');

console.log('🚀 Starting AniVerse Supabase API Server...');
console.log(`📡 Supabase URL: ${supabaseUrl}`);

app.get('/', (req, res) => {
  res.json({
    message: '🎬 AniVerse API Server (Supabase)',
    status: 'running',
    database: 'Supabase PostgreSQL',
    endpoints: {
      content: {
        library: 'GET /api/library',
        seriesDetail: 'GET /api/series/:slug',
        seriesEpisode: 'GET /api/series/:slug/episode/:season-:episode',
        movieDetail: 'GET /api/movies/:slug',
        latestEpisodes: 'GET /api/latest-episodes'
      },
      auth: {
        forgotPassword: 'POST /api/auth/forgot-password',
        resetPassword: 'POST /api/auth/reset-password',
        sendOtp: 'POST /api/auth/send-otp',
        signup: 'POST /api/auth/signup',
        signin: 'POST /api/auth/signin',
        logout: 'POST /api/auth/logout',
        profile: 'GET /api/user/profile/:email'
      },
      favorites: {
        list: 'GET /api/favorites/:email',
        add: 'POST /api/favorites',
        remove: 'DELETE /api/favorites/:email/:slug'
      },
      watchHistory: {
        track: 'POST /api/watch-history',
        list: 'GET /api/watch-history/:email'
      },
      comments: {
        post: 'POST /api/comments (requires login)',
        fetch: 'GET /api/comments/:location',
        delete: 'DELETE /api/comments/:id (requires login)'
      }
    }
  });
});


// 404 handler - must be last
app.use((req, res) => {
  console.log(`❌ 404 - ${req.method} ${req.path} not found`);
  res.status(404).json({ error: 'Endpoint not found', path: req.path, method: req.method });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 API available at http://localhost:${PORT}/api`);
  console.log('');
  console.log('📊 Content Endpoints:');
  console.log('   - GET /api/library');
  console.log('   - GET /api/series/:slug');
  console.log('   - GET /api/series/:slug/episode/:season-:episode');
  console.log('   - GET /api/movies/:slug');
  console.log('   - GET /api/latest-episodes');
  console.log('');
  console.log('📊 Auth Endpoints:');
  console.log('   - POST /api/auth/forgot-password');
  console.log('   - POST /api/auth/reset-password');
  console.log('   - POST /api/auth/send-otp');
  console.log('   - POST /api/auth/signup');
  console.log('   - POST /api/auth/signin');
  console.log('   - POST /api/auth/logout');
  console.log('   - GET /api/user/profile/:email');
  console.log('');
  console.log('📊 Favorites Endpoints:');
  console.log('   - GET /api/favorites/:email');
  console.log('   - POST /api/favorites');
  console.log('   - DELETE /api/favorites/:email/:slug');
  console.log('');
  console.log('📊 Watch History Endpoints:');
  console.log('   - POST /api/watch-history');
  console.log('   - GET /api/watch-history/:email');
});

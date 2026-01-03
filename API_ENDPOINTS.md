# AniVerse Backend API Endpoints

All these APIs are now available in the **backend folder** at `backend/src/routes/`

## Content APIs (backend/src/routes/content.js)

### 1. Get Library (All Series & Movies)
```
GET /api/library
```
Returns all available series and movies

### 2. Get Series Details
```
GET /api/series/:slug
Example: GET /api/series/gachiakuta
```
Returns series information with all episodes organized by season

### 3. Get Episode (For Playing)
```
GET /api/series/:slug/episode/:season-:episode
Example: GET /api/series/gachiakuta/episode/1-1
```
Returns episode details including video servers, thumbnails, and player info

### 4. Get Movie Details
```
GET /api/movies/:slug
Example: GET /api/movies/spookiz-the-movie
```
Returns movie information and available servers

### 5. Get Latest Episodes
```
GET /api/latest-episodes
```
Returns the 20 latest episodes added to the platform

---

## Authentication APIs (backend/src/routes/auth.js)

```
POST /api/auth/send-otp         - Send OTP to email
POST /api/auth/signup            - Register new user
POST /api/auth/signin            - Login user
POST /api/auth/logout            - Logout user
GET  /api/user/profile/:email    - Get user profile
```

---

## Favorites APIs (backend/src/routes/favorites.js)

```
GET    /api/favorites/:email              - Get user's favorites
POST   /api/favorites                     - Add to favorites
DELETE /api/favorites/:email/:slug        - Remove from favorites
```

---

## Watch History APIs (backend/src/routes/watchHistory.js)

```
POST /api/watch-history           - Record watched content
GET  /api/watch-history/:email    - Get user's watch history
```

---

## How to Use

All APIs are imported and registered in `backend/src/server.js`:

```javascript
import contentRoutes from './routes/content.js';
import authRoutes from './routes/auth.js';
import favoritesRoutes from './routes/favorites.js';
import watchHistoryRoutes from './routes/watchHistory.js';

app.use('/api', contentRoutes);
app.use('/api', authRoutes);
app.use('/api', favoritesRoutes);
app.use('/api', watchHistoryRoutes);
```

## Starting the Backend Server

```bash
npm run dev
# or
node src/server.js
```

Server runs on port 4000 (configurable via PORT env var)

All APIs are ready to be called from the frontend!

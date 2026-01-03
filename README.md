# AniVerse Backend - Episode Scraper & TMDB Sync

Complete backend system for scraping anime episodes, managing Supabase database, and enriching metadata with TMDB API.

## 🎯 Features

✅ **Episode Scraping** - Automatically scrape episodes from source website  
✅ **Supabase Integration** - Full database CRUD operations  
✅ **TMDB Enrichment** - Fetch rich metadata (genres, ratings, posters)  
✅ **Missing Episode Detection** - Find gaps in episode collections  
✅ **Proxy Support** - Built-in proxy rotation for reliability  
✅ **REST API** - Full API for managing series and episodes  
✅ **Render Deployment** - Ready to deploy on Render.com  

## 📦 Installation

### Local Setup

```bash
cd backend
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `TMDB_API_KEY` - The Movie Database API key (optional but recommended)

Optional variables:
- `PROXY_LIST` - Comma-separated proxy list (format: host:port:user:pass)
- `PORT` - Server port (default: 3000)

## 🚀 Usage

### 1. Start API Server

```bash
npm start
```

Server will run on `http://localhost:3000`

### 2. Scrape Single Episode

```bash
npm run scrape <episode-url>

# Example:
npm run scrape https://toonstream.love/episode/naruto-1x1/
```

### 3. Analyze Database

Find missing episodes and series stats:

```bash
npm run sync analyze
```

### 4. Enrich with TMDB

Enrich single series:
```bash
npm run sync enrich <series-slug>

# Example:
npm run sync enrich naruto
```

Enrich all series:
```bash
npm run sync enrich-all
```

### 5. Find Series Missing TMDB Data

```bash
npm run sync missing-tmdb
```

## 🌐 API Endpoints

### Series Management

- `GET /api/series` - Get all series
- `GET /api/series/:slug` - Get specific series
- `GET /api/series/:slug/stats` - Get series statistics
- `GET /api/series/:slug/episodes` - Get all episodes for a series
- `GET /api/series/:slug/missing` - Get missing episodes

### Analysis

- `GET /api/analyze` - Analyze all series (episodes, seasons, missing)
- `GET /api/analyze/missing-tmdb` - Find series without TMDB data

### Scraping

- `POST /api/scrape` - Scrape episode
  ```json
  {
    "url": "https://toonstream.love/episode/naruto-1x1/",
    "force": false
  }
  ```

### TMDB Enrichment

- `POST /api/tmdb/enrich/:slug` - Enrich specific series
- `POST /api/tmdb/enrich-all` - Enrich all series (background job)

## 📡 Proxy Configuration

Add proxies in `.env` file:

```env
PROXY_LIST=proxy1.com:8080:user:pass,proxy2.com:8080:user:pass
```

Format: `host:port:username:password`

The system automatically rotates through proxies and marks failed ones.

## 🎬 TMDB Integration

### Get TMDB API Key

1. Go to https://www.themoviedb.org/
2. Create free account
3. Go to Settings → API → Create API Key
4. Copy API Key (v3 auth)
5. Add to `.env` as `TMDB_API_KEY`

### What TMDB Provides

- ✅ Accurate ratings (0-10 scale)
- ✅ Popularity scores
- ✅ Complete genre lists
- ✅ Studio/production company info
- ✅ High-quality posters and backdrops
- ✅ Release dates and episode counts
- ✅ Detailed descriptions

## 🌍 Deploy to Render

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Backend setup"
git remote add origin <your-repo-url>
git push -u origin main
```

### Step 2: Create Render Web Service

1. Go to https://render.com/
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node

### Step 3: Add Environment Variables

In Render dashboard, add these environment variables:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TMDB_API_KEY=your-tmdb-api-key
PORT=3000
NODE_ENV=production
```

### Step 4: Deploy

Click "Create Web Service" - Render will automatically deploy!

Your API will be available at: `https://your-app.onrender.com`

## 📊 Example Workflow

### Complete Setup Flow

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 3. Start API server
npm start

# 4. Analyze existing database
npm run sync analyze

# 5. Find series needing TMDB data
npm run sync missing-tmdb

# 6. Enrich all series with TMDB
npm run sync enrich-all

# 7. Scrape new episode
npm run scrape https://toonstream.love/episode/one-piece-1x1000/
```

### API Usage Examples

```bash
# Get all series
curl http://localhost:3000/api/series

# Get series stats
curl http://localhost:3000/api/series/naruto/stats

# Get missing episodes
curl http://localhost:3000/api/series/naruto/missing

# Scrape episode
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url":"https://toonstream.love/episode/naruto-1x1/"}'

# Enrich with TMDB
curl -X POST http://localhost:3000/api/tmdb/enrich/naruto
```

## 🔒 Security Notes

- ⚠️ Never commit `.env` file to Git
- ⚠️ Keep `SUPABASE_SERVICE_ROLE_KEY` secure
- ⚠️ Use environment variables on Render
- ✅ Service role key is restricted to server-side only

## 📁 Project Structure

```
backend/
├── src/
│   ├── index.js           # Main API server
│   ├── config.js          # Configuration
│   ├── scraper.js         # Episode scraper
│   ├── supabase-client.js # Database operations
│   ├── supabase-sync.js   # Analysis & sync tools
│   ├── tmdb-fetcher.js    # TMDB API integration
│   └── proxy-manager.js   # Proxy rotation
├── logs/                  # Log files (auto-created)
├── package.json
├── .env.example
└── README.md
```

## 🐛 Troubleshooting

### Error: "SUPABASE_URL is required"
- Make sure `.env` file exists
- Check that all required variables are set

### Error: "Failed to fetch after X attempts"
- Check your internet connection
- Try adding proxies if blocked
- Increase timeout in `.env`

### TMDB Not Working
- Verify `TMDB_API_KEY` is correct
- Check TMDB API rate limits (40 req/10s)
- System has built-in delays to respect limits

### Proxy Errors
- Verify proxy format: `host:port:user:pass`
- Test proxies individually
- System auto-rotates failed proxies

## 📝 License

ISC License - Free to use and modify

## 🤝 Contributing

Issues and PRs welcome!

---

Made with ❤️ for AniVerse

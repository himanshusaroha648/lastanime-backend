# Deployment Guide - Render.com

Complete guide to deploying AniVerse Backend on Render.

## 🚀 Quick Deploy (Recommended)

### Option 1: GitHub Integration (Easiest)

1. **Push code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial backend setup"
   git remote add origin https://github.com/your-username/your-repo.git
   git push -u origin main
   ```

2. **Create Render Web Service**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click **"New +"** → **"Web Service"**
   - Connect your GitHub repository
   - Render will auto-detect the `render.yaml` configuration

3. **Configure Environment Variables**
   
   Add these in Render dashboard (Settings → Environment):
   
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   TMDB_API_KEY=your-tmdb-api-key-here
   ```
   
   Optional:
   ```
   PROXY_LIST=proxy1.com:8080:user:pass,proxy2.com:8080:user:pass
   ```

4. **Deploy**
   - Click **"Create Web Service"**
   - Render automatically builds and deploys
   - Your API will be live at: `https://your-app.onrender.com`

### Option 2: Manual Configuration

If `render.yaml` is not detected:

1. **Root Directory**: `backend`
2. **Environment**: `Node`
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. **Health Check Path**: `/health`

## 📡 After Deployment

### Test Your API

```bash
# Health check
curl https://your-app.onrender.com/health

# Get all series
curl https://your-app.onrender.com/api/series

# Analyze database
curl https://your-app.onrender.com/api/analyze
```

### Connect from Frontend

Update your frontend to use the Render API URL:

```javascript
const API_URL = 'https://your-app.onrender.com';
```

## 🔒 Security Checklist

- ✅ Use `SUPABASE_SERVICE_ROLE_KEY` (not ANON_KEY)
- ✅ Never commit `.env` file
- ✅ Set all environment variables in Render dashboard
- ✅ Enable HTTPS (automatic on Render)
- ✅ Use health check endpoint for monitoring

## 🔄 Auto-Deploy on Git Push

Render automatically deploys when you push to GitHub:

```bash
git add .
git commit -m "Update backend"
git push origin main
# Render auto-deploys!
```

## 💰 Pricing

**Free Tier:**
- ✅ Free for 750 hours/month
- ⚠️ Spins down after 15 min inactivity
- ⚠️ Slow cold starts (~30 seconds)

**Paid Plans ($7/month):**
- ✅ Always running (no spin down)
- ✅ Faster performance
- ✅ Custom domains

## 📊 Monitoring

### View Logs

```bash
# In Render dashboard:
Logs → Select service → View real-time logs
```

### Health Checks

Render automatically pings `/health` endpoint to verify service is running.

## 🐛 Troubleshooting

### Build Fails

**Error: "Cannot find module"**
```bash
# Solution: Make sure package.json is correct
cd backend
npm install
npm start  # Test locally first
```

### Service Won't Start

**Check Logs:**
1. Go to Render dashboard
2. Click your service
3. View "Logs" tab
4. Look for error messages

**Common Issues:**
- Missing environment variables
- Wrong start command
- Port binding issues (use PORT env variable)

### Slow Performance

**Free Tier Limitations:**
- Service spins down after 15 min
- First request after spin down takes ~30s
- Upgrade to paid plan for always-on service

## 🔧 Advanced Configuration

### Custom Domain

1. Render dashboard → Your service → Settings
2. Add custom domain
3. Update DNS records as instructed
4. SSL certificate auto-generated

### Multiple Environments

Create separate services for:
- **Production** (main branch)
- **Staging** (develop branch)

Each with its own environment variables.

### Scheduled Jobs

For regular scraping tasks:

1. Create new "Cron Job" in Render
2. Schedule: `0 */6 * * *` (every 6 hours)
3. Command: `npm run sync enrich-all`

## 📞 Support

- [Render Documentation](https://render.com/docs)
- [Render Community](https://community.render.com/)

---

✅ **Deployment Complete!** Your backend is now live and ready to handle requests.

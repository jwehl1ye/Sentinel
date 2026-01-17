# Quick Setup Guide

Follow these steps **in order** to get Sentinel running:

## Step 1: Prerequisites Check

```bash
# Check Node.js version (need v18+)
node --version

# Check npm version
npm --version

# Check if FFmpeg is installed
ffmpeg -version
```

If any are missing, install them:
- **Node.js**: https://nodejs.org/
- **FFmpeg**: 
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt-get install ffmpeg`
  - Windows: https://ffmpeg.org/download.html

## Step 2: Clone and Install

```bash
# Clone the repo
git clone https://github.com/Jxyy14/Sentinel.git
cd Sentinel

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

## Step 3: Create Environment File

```bash
# Go back to backend folder
cd ../backend

# Copy example file
cp .env.example .env

# Generate JWT secret
openssl rand -base64 32
# (Copy the output - you'll need it in step 4)
```

## Step 4: Get API Keys

You'll need API keys from these services:

### A. TwelveLabs (Video Analysis)

1. Go to: https://twelvelabs.io/
2. Sign up / Log in
3. Get API key → `TWELVELABS_KEY`
4. Create an Index → `TWELVELABS_INDEX_ID`

### B. Google Gemini (AI)

1. Go to: https://aistudio.google.com/app/apikey
2. Click "Get API Key" or "Create API Key"
3. Copy key → `GEMINI_API_KEY`

### C. Twilio (Phone Calls)

1. Go to: https://console.twilio.com/
2. Sign up (free account works)
3. Dashboard shows:
   - Account SID → `TWILIO_ACCOUNT_SID`
   - Auth Token (click "Show") → `TWILIO_AUTH_TOKEN`
4. Buy a phone number → `TWILIO_PHONE_NUMBER`
5. **Important**: Verify your phone number in Verified Caller IDs

### D. ElevenLabs (Voice)

1. Go to: https://elevenlabs.io/
2. Sign up / Log in
3. Profile → API Keys → Generate → `ELEVENLABS_API_KEY`

## Step 5: Edit .env File

Open `backend/.env` and replace all `your_*_here` values:

```bash
# Use your favorite editor
nano backend/.env
# or
code backend/.env
# or
vim backend/.env
```

Replace:
- `TWELVELABS_KEY` = your actual key
- `TWELVELABS_INDEX_ID` = your actual index ID
- `GEMINI_API_KEY` = your actual key
- `TWILIO_ACCOUNT_SID` = your actual SID
- `TWILIO_AUTH_TOKEN` = your actual token
- `TWILIO_PHONE_NUMBER` = your actual number (format: +1234567890)
- `ELEVENLABS_API_KEY` = your actual key
- `JWT_SECRET` = paste the random string from step 3

## Step 6: Start the App

**Terminal 1 - Backend:**
```bash
cd backend
npm start
# Should see: "SafeStream server running on port 3001"
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# Should see: "Local: http://localhost:5173/"
```

## Step 7: Open in Browser

Open: **http://localhost:5173**

1. Create an account (Sign Up)
2. You're ready to use the app!

## Troubleshooting

### "Cannot find module" errors
```bash
# Reinstall dependencies
cd backend && rm -rf node_modules package-lock.json && npm install
cd ../frontend && rm -rf node_modules package-lock.json && npm install
```

### Port already in use
```bash
# Kill process on port 3001 (backend)
lsof -ti:3001 | xargs kill -9

# Kill process on port 5173 (frontend)
lsof -ti:5173 | xargs kill -9
```

### API errors
- Check `.env` file has all keys set
- Verify API keys are correct (no extra spaces)
- Check API service dashboards for account status

### Video not analyzing
- Verify `TWELVELABS_KEY` and `TWELVELABS_INDEX_ID` in `.env`
- Check FFmpeg is installed: `ffmpeg -version`

### Emergency call not working
- Verify Twilio credentials in `.env`
- Make sure phone number is verified in Twilio Console
- Check phone number format: `+1234567890` (with country code)

## Need Help?

1. Check `README.md` for detailed documentation
2. Check backend terminal for error messages
3. Check browser console (F12) for frontend errors
4. Verify all API keys are correct in `.env`

---

**Common Issues:**

| Error | Solution |
|-------|----------|
| `Module not found` | Run `npm install` in both `backend/` and `frontend/` |
| `Port 3001 in use` | Kill the process: `lsof -ti:3001 \| xargs kill -9` |
| `API key invalid` | Double-check `.env` file - no quotes around values |
| `Database error` | Delete `backend/safestream.db` and restart |
| `FFmpeg not found` | Install FFmpeg (see step 1) |

# Troubleshooting Guide - Fixing API Issues

If you've cloned the repo and added API keys to `.env` but things like TwelveLabs, phone calls, or Gemini aren't working, follow these steps:

## ⚠️ Most Common Issue: Twilio Needs a Public URL

**The phone calling system requires your SERVER_URL to be publicly accessible** (Twilio needs to send webhooks to your server). If `SERVER_URL` is set to `http://localhost:3001`, it won't work!

### Solution: Set Up ngrok (Required for Phone Calls)

1. **Install ngrok**:
   - macOS: `brew install ngrok`
   - Windows: Download from [ngrok.com](https://ngrok.com/download)
   - Linux: `sudo snap install ngrok` or download from ngrok.com

2. **Sign up for free ngrok account** (required now):
   - Go to [ngrok.com](https://ngrok.com/signup)
   - Sign up and get your authtoken from the dashboard

3. **Configure ngrok**:
   ```bash
   ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN_HERE
   ```

4. **Start ngrok tunnel** (in a separate terminal):
   ```bash
   ngrok http 3001
   ```
   This will give you a URL like: `https://abc123.ngrok-free.app`

5. **Update your `.env` file**:
   - Open `backend/.env`
   - Change `SERVER_URL` from `http://localhost:3001` to your ngrok URL:
     ```
     SERVER_URL=https://abc123.ngrok-free.app
     ```
   - **IMPORTANT**: Every time you restart ngrok, you get a new URL - update SERVER_URL!

6. **Restart your backend server** after updating SERVER_URL

---

## Step-by-Step Complete Fix

### Step 1: Verify All Dependencies Are Installed

#### Backend:
```bash
cd backend
npm install
```

**Check if these packages installed correctly:**
- `@google/generative-ai`
- `twilio`
- `twelvelabs-js`
- `dotenv`

If any are missing, run:
```bash
npm install @google/generative-ai twilio twelvelabs-js dotenv
```

#### Frontend:
```bash
cd frontend
npm install
```

### Step 2: Verify Your `.env` File Location and Format

1. **Check the file exists**: `backend/.env` (not `backend/env` or `backend/.env.example`)

2. **Verify the file format** (no quotes around values, no spaces around `=`):
   ```
   PORT=3001
   SERVER_URL=https://your-ngrok-url.ngrok-free.app
   TWELVELABS_KEY=tlk_2B77TXZ2FDGH4H2MYAM2837YA7JZ
   TWELVELABS_INDEX_ID=696b2f8a684c0432bbde44fd
   GEMINI_API_KEY=AIzaSyAC0c_pkOLJQ1lZWT3ucoNaTGrWphibSLU
   TWILIO_ACCOUNT_SID=AC343e503a88561743b588769f2ae90f91
   TWILIO_AUTH_TOKEN=f749a7d6cb15185292b878a6287d6341
   TWILIO_PHONE_NUMBER=+14313405626
   ELEVENLABS_API_KEY=sk_d1d97c5c92aac50b49e2efda6c42a10c9734a583b1d209b7
   JWT_SECRET=your-random-jwt-secret-here
   ```

3. **Check for hidden characters**: Make sure there are no spaces or quotes:
   - ❌ Wrong: `TWELVELABS_KEY="tlk_2B77..."` or `TWELVELABS_KEY = tlk_2B77...`
   - ✅ Correct: `TWELVELABS_KEY=tlk_2B77...`

### Step 3: Verify Environment Variables Are Loading

1. **Start the backend**:
   ```bash
   cd backend
   node server.js
   ```

2. **Check the console output** - you should see:
   - ✅ `SafeStream server running on port 3001`
   - ❌ If you see errors about missing modules or undefined variables, the `.env` file isn't loading

3. **Test if variables are loaded** (temporary check):
   - Add this line at the top of `backend/server.js`:
     ```javascript
     console.log('TWELVELABS_KEY:', process.env.TWELVELABS_KEY ? 'LOADED' : 'MISSING');
     console.log('SERVER_URL:', process.env.SERVER_URL);
     ```
   - Restart the server and check the output
   - If it shows `MISSING` or `undefined`, your `.env` file isn't being read

### Step 4: Check Each API Service

#### A. Test TwelveLabs API

1. **Verify the API key is correct** - Check it works by running:
   ```bash
   curl -X GET "https://api.twelvelabs.io/v1.2/indexes" \
     -H "x-api-key: YOUR_TWELVELABS_KEY_HERE"
   ```
   Should return JSON with your indexes (not an error).

2. **Check the Index ID** - Make sure `TWELVELABS_INDEX_ID` matches one of your indexes:
   ```bash
   curl -X GET "https://api.twelvelabs.io/v1.2/indexes" \
     -H "x-api-key: YOUR_TWELVELABS_KEY_HERE" \
     | grep -i "your_index_id"
   ```

#### B. Test Twilio API

1. **Verify credentials**:
   ```bash
   curl -X GET "https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID.json" \
     -u "YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN"
   ```
   Should return account info (not 401 Unauthorized).

2. **Check your phone number format**:
   - Must include country code: `+14313405626` (not `4313405626`)

3. **CRITICAL**: Make sure `SERVER_URL` in `.env` is your **public ngrok URL**, not `localhost`!

#### C. Test Gemini API

1. **Verify the API key works**:
   ```bash
   curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=YOUR_GEMINI_API_KEY" \
     -H 'Content-Type: application/json' \
     -d '{"contents":[{"parts":[{"text":"test"}]}]}'
   ```
   Should return JSON (not 400/403 error).

2. **Check quota/limits** - Free tier has rate limits. If you hit the limit, wait or check [Google AI Studio](https://aistudio.google.com/app/apikey).

#### D. Test ElevenLabs API

1. **Verify API key has permissions**:
   ```bash
   curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL" \
     -H "xi-api-key: YOUR_ELEVENLABS_KEY" \
     -H "Content-Type: application/json" \
     -d '{"text": "test"}' \
     -o test.mp3
   ```
   - Should create `test.mp3` file (not error JSON)
   - If you get "missing_permissions", enable "text_to_speech" permission in your ElevenLabs account

### Step 5: Initialize Database

1. **Delete old database** (if exists):
   ```bash
   cd backend
   rm -f safestream.db safestream.db-shm safestream.db-wal
   ```

2. **Start the server** - it will create a new database automatically

### Step 6: Check Server Logs for Errors

When you start the backend, watch for error messages:

```bash
cd backend
node server.js
```

**Look for:**
- ❌ `Error: Cannot find module` → Run `npm install` again
- ❌ `Error: TWELVELABS_KEY is not defined` → Check `.env` file format
- ❌ `Twilio webhook failed` → SERVER_URL is not publicly accessible (needs ngrok)
- ❌ `401 Unauthorized` → API key is wrong or expired
- ❌ `429 Too Many Requests` → API quota exceeded (wait or upgrade)

### Step 7: Restart Everything

1. **Stop all running processes**:
   - Backend: `Ctrl+C` in backend terminal
   - Frontend: `Ctrl+C` in frontend terminal
   - ngrok: `Ctrl+C` in ngrok terminal

2. **Start in this order**:
   ```bash
   # Terminal 1: ngrok (if using phone calls)
   ngrok http 3001
   # Copy the HTTPS URL and update SERVER_URL in backend/.env

   # Terminal 2: Backend
   cd backend
   node server.js

   # Terminal 3: Frontend
   cd frontend
   npm run dev
   ```

---

## Quick Checklist

Before asking for help, verify:

- [ ] All `npm install` commands completed successfully (both backend and frontend)
- [ ] `.env` file exists in `backend/` directory (not `backend/.env.example`)
- [ ] All API keys in `.env` are correct (no extra spaces, no quotes)
- [ ] `SERVER_URL` in `.env` is **public ngrok URL** (not `localhost`) if using phone calls
- [ ] ngrok is running and tunnel is active (check ngrok dashboard: http://127.0.0.1:4040)
- [ ] Backend server started without errors (`SafeStream server running on port 3001`)
- [ ] Frontend started without errors
- [ ] Browser console shows no CORS errors
- [ ] Database file `backend/safestream.db` exists

---

## Still Not Working?

1. **Check backend terminal** for specific error messages
2. **Check browser console** (F12 → Console tab) for frontend errors
3. **Verify ngrok tunnel** is active: Open http://127.0.0.1:4040 in browser
4. **Test each API individually** using the curl commands above
5. **Check API quotas** - Free tiers have limits (especially Gemini)

---

## Common Error Messages and Fixes

### "Cannot find module 'twilio'"
**Fix**: `cd backend && npm install twilio`

### "Twilio webhook returned 404"
**Fix**: SERVER_URL must be publicly accessible (use ngrok). Update `.env` with ngrok URL.

### "TwelveLabs error: 401 Unauthorized"
**Fix**: Check `TWELVELABS_KEY` is correct in `.env` file.

### "Gemini API error: 429 Too Many Requests"
**Fix**: Free tier quota exceeded. Wait 1 minute or upgrade API quota.

### "ElevenLabs missing_permissions"
**Fix**: Enable "text_to_speech" permission in your ElevenLabs account settings.

### "Failed to connect to server"
**Fix**: Make sure backend is running on port 3001. Check `PORT=3001` in `.env`.

---

## Need More Help?

1. Share the **exact error message** from backend terminal
2. Share the **browser console errors** (F12 → Console)
3. Verify `SERVER_URL` is correct (should be ngrok URL for phone calls)
4. Confirm all API keys are valid (test with curl commands above)

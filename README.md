# Sentinel - Safety Streaming App

A full-stack safety application with live video recording, AI threat detection, emergency calling, and safety mapping features.

## 🚀 Quick Start Guide

### Prerequisites

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** - [Download](https://git-scm.com/)
- **FFmpeg** (for video processing) - [Download](https://ffmpeg.org/download.html)
  - **macOS**: `brew install ffmpeg`
  - **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH
  - **Linux**: `sudo apt-get install ffmpeg` or `sudo yum install ffmpeg`

### 1. Clone the Repository

```bash
git clone https://github.com/Jxyy14/Sentinel.git
cd Sentinel
```

### 2. Install Dependencies

#### Backend Dependencies

```bash
cd backend
npm install
```

#### Frontend Dependencies

```bash
cd ../frontend
npm install
```

### 3. Set Up Environment Variables

#### Backend Environment (.env file)

Create a file named `.env` in the `backend` folder with the following content:

```bash
# Server Configuration
PORT=3001
SERVER_URL=http://localhost:3001

# JWT Secret (generate a random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-to-random-string

# Database (SQLite - will be created automatically)
DATABASE_PATH=./safestream.db

# TwelveLabs API (for video threat detection)
# Get your API key from: https://elevenlabs.io/app/settings/api-keys
TWELVELABS_KEY=your_twelvelabs_api_key_here
TWELVELABS_INDEX_ID=your_twelvelabs_index_id_here

# Google Gemini API (for AI analysis and chat)
# Get your API key from: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Twilio (for real phone calls)
# Get these from: https://console.twilio.com/
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=your_twilio_phone_number_here

# ElevenLabs API (for text-to-speech)
# Get your API key from: https://elevenlabs.io/app/settings/api-keys
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

**Important**: Replace all `your_*_here` values with your actual API keys and credentials (see API Setup section below).

### 4. API Key Setup Instructions

#### A. TwelveLabs (Video Analysis)

1. Go to [TwelveLabs Platform](https://twelvelabs.io/)
2. Sign up or log in
3. Navigate to **API Keys** section
4. Create a new API key and copy it → `TWELVELABS_KEY`
5. Navigate to **Indexes** section
6. Create a new index (or use existing) and copy the Index ID → `TWELVELABS_INDEX_ID`
7. Add both to your `backend/.env` file

#### B. Google Gemini API

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Get API Key"** or **"Create API Key"**
4. Select or create a Google Cloud project
5. Copy the API key → `GEMINI_API_KEY`
6. Add to your `backend/.env` file

**Note**: Free tier has rate limits. For production, consider upgrading.

#### C. Twilio (Phone Calls)

1. Go to [Twilio Console](https://console.twilio.com/)
2. Sign up for a free account
3. Once logged in, find your:
   - **Account SID** (on dashboard) → `TWILIO_ACCOUNT_SID`
   - **Auth Token** (click "Show" next to Auth Token) → `TWILIO_AUTH_TOKEN`
4. To get a phone number:
   - Go to **Phone Numbers** → **Buy a number**
   - Select a number (free tier has limitations)
   - Copy the phone number in E.164 format (e.g., `+1234567890`) → `TWILIO_PHONE_NUMBER`
5. **Important**: Verify your test phone number:
   - Go to **Phone Numbers** → **Manage** → **Verified Caller IDs**
   - Add your phone number for testing
6. Add all three values to your `backend/.env` file

**Note**: Twilio trial accounts can only call verified numbers. Upgrade for production use.

#### D. ElevenLabs (Text-to-Speech)

1. Go to [ElevenLabs](https://elevenlabs.io/)
2. Sign up or log in
3. Go to **Profile** → **API Keys**
4. Click **"Generate New API Key"** and copy it → `ELEVENLABS_API_KEY`
5. Add to your `backend/.env` file

#### E. Generate JWT Secret (Optional but Recommended)

Generate a random secret for JWT token signing:

```bash
# macOS/Linux
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output and use it as `JWT_SECRET` in your `.env` file.

### 5. Initialize the Database

The database will be created automatically on first run, but you can also seed it with sample data:

```bash
cd backend
node -e "require('./database.js')"
node seedIncidents.js  # Optional: Add sample incident data
```

### 6. Start the Application

#### Terminal 1: Backend Server

```bash
cd backend
npm start
# Or for development with auto-reload:
node -r dotenv/config server.js
```

The backend should start on `http://localhost:3001`

#### Terminal 2: Frontend Development Server

```bash
cd frontend
npm run dev
```

The frontend should start on `http://localhost:5173`

### 7. Access the Application

Open your browser and navigate to:
- **Local**: http://localhost:5173
- **Network** (for phone access): Check the terminal output for the network URL (e.g., `http://192.168.1.100:5173`)

### 8. First-Time Setup: Create an Account

1. Open the app in your browser
2. Click **"Sign Up"** to create a new account
3. Enter your name, email, and password
4. You'll be automatically logged in

## 📋 Feature-Specific Setup

### Safety Map Feature

The Safety Map works out of the box. Sample incident data is included when you seed the database:

```bash
cd backend
node seedIncidents.js
```

### Video Recording & TwelveLabs Analysis

1. Make sure `TWELVELABS_KEY` and `TWELVELABS_INDEX_ID` are set in `backend/.env`
2. Start recording in the app
3. Stop and save the recording
4. TwelveLabs will automatically analyze the video for threats
5. View analysis in the **History** page

### Emergency Call Feature (911 AI Call)

**Requirements:**
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` set in `.env`
- `GEMINI_API_KEY` set in `.env`
- `ELEVENLABS_API_KEY` set in `.env`
- Verified phone number in Twilio (for trial accounts)

**Setup:**
1. Ensure all API keys are in `backend/.env`
2. Verify your phone number in Twilio Console (see Twilio setup above)
3. Start a video recording
4. Click the **"911"** button
5. Your phone will ring (if Twilio is configured)
6. Answer and speak with the AI assistant

**Note**: The emergency call uses test number `+14372541201` by default. NEVER use actual 911.

### Gemini Video Chat (History Page)

1. Record a video and let it finish processing with TwelveLabs
2. Open the video from the **History** page
3. Click **"Ask Questions About This Video"**
4. Chat with Gemini about what happened in the video

## 🔧 Troubleshooting

### Backend won't start

- Check if port 3001 is already in use: `lsof -i :3001`
- Verify all required npm packages are installed: `cd backend && npm install`
- Check `.env` file exists and has correct format (no quotes around values)

### Frontend won't start

- Check if port 5173 is already in use
- Verify all dependencies: `cd frontend && npm install`
- Clear cache: `rm -rf node_modules package-lock.json && npm install`

### Video not uploading/analyzing

- Check FFmpeg is installed: `ffmpeg -version`
- Verify `TWELVELABS_KEY` and `TWELVELABS_INDEX_ID` in `.env`
- Check backend logs for errors

### Emergency call not working

- Verify Twilio credentials in `.env`
- Check phone number is verified in Twilio Console
- Ensure `GEMINI_API_KEY` is set (for AI responses)
- Check backend logs for specific errors

### API Rate Limits

If you see "429 Too Many Requests" errors:

- **Gemini**: Free tier has daily limits. Wait for reset or upgrade.
- **TwelveLabs**: Check your plan limits.
- **Twilio**: Trial accounts have limitations. Upgrade for production.

### Database Issues

If the database is corrupted:

```bash
cd backend
rm safestream.db safestream.db-shm safestream.db-wal
# Restart the server - database will be recreated
```

## 📁 Project Structure

```
Sentinel/
├── backend/
│   ├── .env                    # Environment variables (create this)
│   ├── database.js             # Database schema
│   ├── server.js               # Express server
│   ├── routes/                 # API routes
│   ├── services/               # External API services
│   ├── middleware/             # Auth middleware
│   └── uploads/                # Video uploads (auto-created)
│
├── frontend/
│   ├── src/
│   │   ├── pages/              # React pages
│   │   ├── components/         # React components
│   │   ├── services/           # API client
│   │   └── App.jsx             # Main app component
│   └── package.json
│
└── README.md                   # This file
```

## 🔐 Security Notes

- **Never commit** `.env` files to Git
- Use strong, unique `JWT_SECRET`
- Keep API keys private
- Use environment variables, never hardcode secrets
- For production, use a proper database (PostgreSQL, MySQL) instead of SQLite

## 🚀 Production Deployment

For production deployment:

1. Set `SERVER_URL` to your production domain
2. Use a production database (PostgreSQL recommended)
3. Set up HTTPS/SSL certificates
4. Configure proper CORS origins
5. Use environment variables or a secrets manager
6. Set up proper logging and monitoring
7. Configure backup strategies for videos and database

## 📝 License

[Add your license here]

## 👥 Contributors

- Marwan0606
- Jxyy14

## 🆘 Support

For issues, check:
1. This README troubleshooting section
2. Backend logs (`console.log` output in terminal)
3. Browser console (F12) for frontend errors
4. API service documentation (Twilio, Gemini, TwelveLabs, ElevenLabs)

---

**Made with ❤️ for safety and security**

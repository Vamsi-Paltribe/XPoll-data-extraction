# Gemini PDF Upload Setup Guide

## 🚀 Quick Setup

### 1. Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key (starts with `AIza...`)

### 2. Get Google Sheets API Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google Sheets API**
4. Go to **IAM & Admin** → **Service Accounts**
5. Click **Create Service Account**
6. Give it a name (e.g., "xpoll-sheets-service")
7. Click **Create and Continue**
8. Skip role assignment (click Continue)
9. Click **Done**
10. Click on the service account you just created
11. Go to **Keys** tab
12. Click **Add Key** → **Create New Key**
13. Choose **JSON** format
14. Download the JSON file
15. Rename it to `google-credentials.json`
16. Place it in `backend/` folder

### 3. Share Google Sheet with Service Account

1. Open the downloaded `google-credentials.json`
2. Find the `client_email` field (looks like: `xpoll-sheets-service@project-id.iam.gserviceaccount.com`)
3. Copy this email
4. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1wCsebIUQi_YZgYCAsfQyAvyRm3cS2r3OaiDvpkZ8Vyo
5. Click **Share** button
6. Paste the service account email
7. Give it **Editor** permissions
8. Click **Send**

### 4. Update Environment Variables

Edit `backend/.env` and add:

```env
# Gemini API Key (from step 1)
GEMINI_API_KEY=AIza_YOUR_KEY_HERE

# Google Sheets credentials path
GOOGLE_SERVICE_ACCOUNT_KEY=./google-credentials.json
```

### 5. Restart Backend

```bash
cd backend
# Stop the server (Ctrl+C)
bun run dev
```

## ✅ Test the Upload

1. Go to Super Admin panel: http://localhost:5174
2. Navigate to **Manage Sheets**
3. Click **Upload PDF Data** section
4. Upload a PDF with voter data
5. Wait for Gemini to process (10-30 seconds)
6. Check the success message showing states and record counts
7. Click "View in Google Sheets" to verify data was added

## 📋 Expected Behavior

### What Gemini Does:
1. Extracts text from PDF
2. Identifies states in the data
3. Organizes records by state
4. Extracts fields: Name, City, Age, Address, Phone, Email

### What the System Does:
1. Creates a new tab for each state (if doesn't exist)
2. Adds headers in first row
3. Appends data matching existing column order
4. Preserves existing data

### Example Result:

**Tab: Georgia**
| Name | City | Age | Address | Phone |
|------|------|-----|---------|-------|
| John Doe | Atlanta | 35 | 123 Main St | 555-1234 |

**Tab: Florida**
| Name | City | Age | Address | Phone |
|------|------|-----|---------|-------|
| Jane Smith | Miami | 42 | 456 Oak Ave | 555-5678 |

## 🐛 Troubleshooting

### "PDF appears to be empty"
- PDF might be scanned image (not text-based)
- Try a different PDF with selectable text

### "Failed to update Google Sheets"
- Check if service account email is shared with Editor access
- Verify `google-credentials.json` is in correct location
- Check file permissions

### "Gemini returned invalid data"
- PDF format might be too complex
- Try a simpler, more structured PDF
- Check Gemini API key is valid

### "Upload failed: 401"
- Gemini API key is invalid or expired
- Get a new key from Google AI Studio

## 💰 Cost Estimate

- **Gemini Flash 2.0**: FREE for <15 requests/min
- **Google Sheets API**: FREE (unlimited)
- **Total**: $0/month for normal usage

## 📝 File Structure

```
backend/
├── services/
│   ├── geminiProcessor.js      # PDF → Gemini extraction
│   └── googleSheetsService.js  # Sheet tab management
├── routes/
│   └── upload.js               # Upload endpoint
├── google-credentials.json     # Service account key (DO NOT COMMIT)
└── .env                        # API keys (DO NOT COMMIT)
```

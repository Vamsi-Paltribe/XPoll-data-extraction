const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { processPdfWithGemini } = require('../services/geminiProcessor');
const { updateGoogleSheets } = require('../services/googleSheetsService');

const router = express.Router();

// Middleware to check for admin status
const adminOnly = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || !user.isAdmin) {
            return res.status(403).json({ msg: 'Access denied. Admin privileges required.' });
        }
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Configure multer for file upload (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only PDF files
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

/**
 * POST /admin/upload-pdf
 * Upload PDF and process with Gemini
 * Appends data to Google Sheets organized by state
 */
router.post('/upload-pdf', auth, adminOnly, upload.single('file'), async (req, res) => {
    try {
        console.log('[Upload] Received PDF upload request');

        // Validate file
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log(`[Upload] File: ${req.file.originalname}, Size: ${req.file.size} bytes`);

        // Step 1: Process PDF with Gemini
        const extractedData = await processPdfWithGemini(req.file.buffer);

        // Step 2: Update Google Sheets
        const summary = await updateGoogleSheets(extractedData);

        // Step 3: Return success response
        res.json({
            success: true,
            message: `Successfully processed ${summary.totalRecords} records across ${summary.totalStates} state(s)`,
            summary: {
                totalStates: summary.totalStates,
                totalRecords: summary.totalRecords,
                states: summary.states
            }
        });

        console.log('[Upload] Upload completed successfully');

    } catch (error) {
        console.error('[Upload] Error:', error.message);

        // Handle specific error types
        if (error.message.includes('PDF appears to be empty')) {
            return res.status(400).json({ error: 'PDF file is empty or unreadable' });
        }

        if (error.message.includes('Gemini returned invalid')) {
            return res.status(500).json({ error: 'Failed to extract data from PDF. Please ensure the PDF contains structured voter data.' });
        }

        if (error.message.includes('Google Sheet')) {
            return res.status(500).json({ error: 'Failed to update Google Sheets. Please check credentials and permissions.' });
        }

        // Generic error
        res.status(500).json({ error: `Upload failed: ${error.message}` });
    }
});

module.exports = router;

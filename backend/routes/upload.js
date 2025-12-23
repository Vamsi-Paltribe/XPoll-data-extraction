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
 * POST /admin/upload-pdf/preview
 * Upload PDF and get preview of extracted data (does NOT save to sheets)
 */
router.post('/upload-pdf/preview', auth, adminOnly, upload.single('file'), async (req, res) => {
    try {
        console.log('[Upload Preview] Received PDF upload request');

        // Validate file
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log(`[Upload Preview] File: ${req.file.originalname}, Size: ${req.file.size} bytes`);

        // Process PDF with Gemini (extraction only, no sheet update)
        const extractedData = await processPdfWithGemini(req.file.buffer);

        // Return preview data
        res.json({
            success: true,
            preview: extractedData,
            summary: {
                totalStates: Object.keys(extractedData).length,
                totalRecords: Object.values(extractedData).reduce((sum, records) => sum + records.length, 0),
                states: Object.entries(extractedData).map(([name, records]) => ({
                    name,
                    recordCount: records.length,
                    sampleRecords: records.slice(0, 3) // First 3 records as sample
                }))
            }
        });

        console.log('[Upload Preview] Preview generated successfully');

    } catch (error) {
        console.error('[Upload Preview] Error:', error.message);

        if (error.message.includes('PDF appears to be empty')) {
            return res.status(400).json({ error: 'PDF file is empty or unreadable' });
        }

        if (error.message.includes('Gemini returned invalid')) {
            return res.status(500).json({ error: 'Failed to extract data from PDF. Please ensure the PDF contains structured voter data.' });
        }

        res.status(500).json({ error: `Preview failed: ${error.message}` });
    }
});

/**
 * POST /admin/upload-pdf/commit
 * Commit previously extracted data to Google Sheets
 */
router.post('/upload-pdf/commit', auth, adminOnly, async (req, res) => {
    try {
        console.log('[Upload Commit] Received commit request');

        const { extractedData } = req.body;

        if (!extractedData || typeof extractedData !== 'object') {
            return res.status(400).json({ error: 'Invalid data format' });
        }

        // Update Google Sheets
        const summary = await updateGoogleSheets(extractedData);

        res.json({
            success: true,
            message: `Successfully saved ${summary.totalRecords} records across ${summary.totalStates} state(s)`,
            summary
        });

        console.log('[Upload Commit] Commit completed successfully');

    } catch (error) {
        console.error('[Upload Commit] Error:', error.message);

        if (error.message.includes('Google Sheet')) {
            return res.status(500).json({ error: 'Failed to update Google Sheets. Please check credentials and permissions.' });
        }

        res.status(500).json({ error: `Commit failed: ${error.message}` });
    }
});

module.exports = router;

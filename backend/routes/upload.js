const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { processDocumentWithOpenAI } = require('../services/openaiProcessor');
// const { processPdfWithGemini } = require('../services/geminiProcessor');
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
        // Accept PDF, Excel, Word, CSV, Images
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
            'text/csv',
            'image/jpeg',
            'image/jpg',
            'image/png'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, Excel, Word, CSV, and Image files are allowed'), false);
        }
    }
});

/**
 * POST /admin/upload-document/preview
 * Upload document (PDF/Excel/Word/CSV) and get preview of extracted data
 */
router.post('/upload-document/preview', auth, adminOnly, async (req, res) => {
    try {
        console.log('[Upload Preview] Received JSON data from frontend');

        // 1. Extract data from request body (no longer using req.file)
        const { fileName, fileData } = req.body;

        // 2. Validate the incoming structure
        if (!fileData || !fileData.content) {
            return res.status(400).json({ error: 'No document content provided in the request body.' });
        }

        console.log(`[Upload Preview] Processing ${fileData.type} for file: ${fileName}`);

        // 3. Process the pre-parsed text/JSON with OpenAI
        // Note: We pass the whole fileData object and the fileName string
        const extractedData = await processDocumentWithOpenAI(fileData, fileName);
        console.log("Extracted Data for Preview:", extractedData);
        // 4. Return preview data with the summary logic
        res.json({
            success: true,
            preview: extractedData,
            summary: {
                totalStates: Object.keys(extractedData).length,
                totalRecords: Object.values(extractedData).reduce((sum, records) => sum + records.length, 0),
                states: Object.entries(extractedData).map(([name, records]) => ({
                    name,
                    recordCount: records.length,
                    sampleRecords: records
                }))
            }
        });

        console.log('[Upload Preview] Preview generated successfully via OpenAI');

    } catch (error) {
        console.error('[Upload Preview] Error:', error.message);

        // Handle specific OpenAI or Parsing errors
        if (error.message.includes('insufficient_quota')) {
            return res.status(402).json({ error: 'OpenAI API quota exceeded.' });
        }

        res.status(500).json({ error: `AI Extraction failed: ${error.message}` });
    }
});

/**
 * POST /admin/upload-document/commit
 * Commit previously extracted data to Google Sheets
 */
router.post('/upload-document/commit', auth, adminOnly, async (req, res) => {
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

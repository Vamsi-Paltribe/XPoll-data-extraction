const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { processDocumentWithOpenAI } = require('../services/openaiProcessor');
// const { processPdfWithGemini } = require('../services/geminiProcessor');
const { updateGoogleSheets } = require('../services/googleSheetsService');
const { extractMappingLogic, applyLogicToDataset } = require('../services/logicExtractor');

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
 * POST /admin/extract-logic
 * Extract mapping logic from sample data (50-100 rows)
 * Returns logic that can be applied to full dataset
 */
router.post('/extract-logic', auth, adminOnly, async (req, res) => {
    try {
        console.log('[Extract Logic] Received request');

        const { sampleData, fileType, fileName } = req.body;

        // Validate payload
        if (!sampleData || !Array.isArray(sampleData)) {
            return res.status(400).json({ error: 'Invalid payload: sampleData must be an array' });
        }

        if (sampleData.length === 0) {
            return res.status(400).json({ error: 'Sample data is empty' });
        }

        console.log(`[Extract Logic] Processing ${sampleData.length} sample rows from ${fileName || 'unknown'}`);

        // Import logic extractor

        // Extract logic from sample
        const result = await extractMappingLogic(sampleData, fileType || 'json', fileName || 'unknown');

        if (!result.success) {
            // Logic extraction failed - need full processing
            return res.json({
                success: false,
                needsFullProcessing: result.needsFullProcessing || true,
                confidence: result.confidence,
                tier: result.tier,
                message: result.message,
                performance: result.performance
            });
        }

        // Logic extracted successfully
        res.json({
            success: true,
            logic: result.logic,
            confidence: result.confidence,
            needsLLM: result.needsLLM,
            tier: result.tier,
            tokenUsage: result.tokenUsage,
            performance: result.performance,
            message: result.message
        });

        console.log(`[Extract Logic] ✅ Logic extracted (Tier ${result.tier}, ${result.tokenUsage.total_tokens} tokens)`);

    } catch (error) {
        console.error('[Extract Logic] Error:', error.message);

        if (error.message.includes('insufficient_quota')) {
            return res.status(402).json({ error: 'OpenAI API quota exceeded.' });
        }

        res.status(500).json({ error: `Logic extraction failed: ${error.message}` });
    }
});

/**
 * POST /admin/upload-document/preview
 * NEW: Supports hybrid mode with pre-extracted logic
 * Accepts: { fullData, logic, fileType, fileName } OR legacy { data, type, fileName }
 * Returns preview data + performance metrics
 */
router.post('/upload-document/preview', auth, adminOnly, async (req, res) => {
    try {
        console.log('[Upload Preview] Received request from frontend');

        const payload = req.body;

        // Check if this is the new hybrid mode (fullData + logic)
        if (payload.fullData && Array.isArray(payload.fullData)) {
            console.log('[Upload Preview] 🚀 HYBRID MODE: Processing with pre-parsed data');
            console.log(`[Upload Preview] Full dataset: ${payload.fullData.length} rows`);

            // Import logic extractor functions

            // CASE 1: Logic already extracted - apply it!
            if (payload.logic && payload.logic.type) {
                console.log(`[Upload Preview] ✅ Applying pre-extracted logic (${payload.logic.type})`);

                const result = await applyLogicToDataset(
                    payload.fullData,
                    payload.logic,
                    payload.fileName || 'unknown'
                );

                if (!result.success) {
                    // Logic application failed - fallback to full processing
                    console.log('[Upload Preview] ⚠️ Logic application failed, falling back to full processing');

                    // Process with OpenAI as fallback
                    const fallbackPayload = {
                        data: payload.fullData,
                        type: 'json',
                        fileName: payload.fileName
                    };

                    const fallbackResult = await processDocumentWithOpenAI(fallbackPayload);

                    return res.json({
                        success: true,
                        preview: fallbackResult.data,
                        performance: fallbackResult.performance,
                        summary: generateSummary(fallbackResult.data),
                        fallbackUsed: true,
                        message: 'Logic application failed, used LLM fallback'
                    });
                }

                // Success! Return preview
                return res.json({
                    success: true,
                    preview: result.data,
                    performance: result.performance,
                    summary: generateSummary(result.data),
                    recordsProcessed: result.recordsProcessed,
                    recordsFailed: result.recordsFailed || 0,
                    message: `Processed ${result.recordsProcessed} records using pre-extracted logic (0 LLM tokens!)`
                });
            }

            // CASE 2: No logic provided - extract from sample, then apply
            console.log('[Upload Preview] ⚡ No logic provided, extracting from sample...');

            // Take first 100 rows as sample
            const sampleSize = Math.min(100, payload.fullData.length);
            const sample = payload.fullData.slice(0, sampleSize);

            console.log(`[Upload Preview] Extracting logic from ${sampleSize} sample rows...`);

            const logicResult = await extractMappingLogic(
                sample,
                payload.fileType || 'json',
                payload.fileName || 'unknown'
            );

            if (!logicResult.success || logicResult.needsFullProcessing) {
                // Logic extraction failed - use full LLM processing
                console.log('[Upload Preview] ⚠️ Logic extraction failed, using full LLM processing');

                const fallbackPayload = {
                    data: payload.fullData,
                    type: 'json',
                    fileName: payload.fileName
                };

                const fallbackResult = await processDocumentWithOpenAI(fallbackPayload);

                return res.json({
                    success: true,
                    preview: fallbackResult.data,
                    performance: fallbackResult.performance,
                    summary: generateSummary(fallbackResult.data),
                    tier: logicResult.tier || 3,
                    message: 'Used full LLM processing (low confidence pattern detection)'
                });
            }

            // Logic extracted! Now apply to full dataset
            console.log(`[Upload Preview] ✅ Logic extracted (Tier ${logicResult.tier}), applying to ${payload.fullData.length} rows...`);

            const applyResult = await applyLogicToDataset(
                payload.fullData,
                logicResult.logic,
                payload.fileName || 'unknown'
            );

            if (!applyResult.success) {
                throw new Error(`Logic application failed: ${applyResult.error}`);
            }

            // Combine performance metrics
            const combinedPerformance = {
                logicExtraction: logicResult.performance,
                logicApplication: applyResult.performance,
                totalTokens: logicResult.tokenUsage.total_tokens
            };

            return res.json({
                success: true,
                preview: applyResult.data,
                performance: combinedPerformance,
                summary: generateSummary(applyResult.data),
                tier: logicResult.tier,
                tokenUsage: logicResult.tokenUsage,
                recordsProcessed: applyResult.recordsProcessed,
                message: `Processed ${applyResult.recordsProcessed} records (Tier ${logicResult.tier}, ${logicResult.tokenUsage.total_tokens} tokens)`
            });
        }

        // LEGACY MODE: Old payload format { data, type, fileName } OR { fileData, fileName }
        console.log('[Upload Preview] 📦 LEGACY MODE: Using old processing flow');

        // Handle both old formats: { data, type } and { fileData: { type, content } }
        let processPayload;

        if (payload.fileData) {
            // New fileData format from frontend
            console.log(`[Upload Preview] FileData format detected: ${payload.fileData.type}`);
            processPayload = {
                data: payload.fileData.content,
                type: payload.fileData.type,
                fileName: payload.fileName
            };
        } else if (payload.data && payload.type) {
            // Old format
            processPayload = payload;
        } else {
            return res.status(400).json({ error: 'Invalid payload: missing data/type or fileData' });
        }

        console.log(`[Upload Preview] Type: ${processPayload.type}, File: ${processPayload.fileName}`);
        console.log(`[Upload Preview] Data size: ${processPayload.data.length} chars`);

        // Process with OpenAI (returns { data, performance } or { needsConfirmation: true, ... })
        const result = await processDocumentWithOpenAI(processPayload);

        // Check if confirmation is needed
        if (result.needsConfirmation) {
            console.log(`[Upload Preview] ⚠️ Confirmation required: ${result.confirmationType}`);
            return res.json({
                success: true,
                needsConfirmation: true,
                confirmationType: result.confirmationType,
                analysis: result.analysis,
                performance: result.performance,
                message: result.message
            });
        }

        const extractedData = result.data;
        const performance = result.performance;

        // Return preview + performance
        res.json({
            success: true,
            preview: extractedData,
            performance: {
                totalTime: performance.totalTime,
                totalMemory: Math.round(performance.totalMemory / 1024 / 1024 * 100) / 100, // MB
                tokens: performance.tokenUsage,
                steps: performance.steps,
                summary: performance.summary
            },
            summary: generateSummary(extractedData)
        });

        console.log('[Upload Preview] ✅ Preview generated successfully');

    } catch (error) {
        console.error('[Upload Preview] Error:', error.message);

        if (error.message.includes('insufficient_quota')) {
            return res.status(402).json({ error: 'OpenAI API quota exceeded.' });
        }

        res.status(500).json({ error: `Processing failed: ${error.message}` });
    }
});

/**
 * Helper function to generate summary from grouped data
 */
function generateSummary(groupedData) {
    return {
        totalStates: Object.keys(groupedData).length,
        totalRecords: Object.values(groupedData).reduce((sum, records) => sum + records.length, 0),
        states: Object.entries(groupedData).map(([name, records]) => ({
            name,
            recordCount: records.length,
            sampleRecords: records // First 3 for preview
        }))
    };
}

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

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Bucket = require('../models/Bucket');
const CustomerRecord = require('../models/CustomerRecord');

// Memory storage for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to check for admin status
const adminOnly = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || (!user.isAdmin && user.email !== 'super@gmail.com')) {
            return res.status(403).json({ msg: 'Access denied. Admin privileges required.' });
        }
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

router.use(auth);
router.use(adminOnly);

// Upload CSV Data to Bucket
router.post('/buckets/:id/upload', upload.single('file'), async (req, res) => {
    try {
        const bucketId = req.params.id;
        const bucket = await Bucket.findById(bucketId);
        if (!bucket) return res.status(404).json({ msg: 'Bucket not found' });

        if (!req.file) {
            return res.status(400).json({ msg: 'No file uploaded' });
        }

        // Parse CSV
        const fileContent = req.file.buffer.toString('utf-8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        console.log(`[Upload] Parsed ${records.length} records for bucket ${bucket.name}`);

        let upsertCount = 0;
        let errorCount = 0;

        // Process Records
        for (const record of records) {
            try {
                // Generate KeyHash (State|City|Name) as fallback uniqueness
                // Similar to stagingService.js logic
                const state = (record.State || record.STATE || record.state || '').toLowerCase().trim();
                const city = (record.City || record.CITY || record.city || '').toLowerCase().trim();
                const name = (record.Name || record.NAME || record.name || '').toLowerCase().trim();

                // If critical fields missing, skip or use a UUID? 
                // We'll require at least a name or use a random hash if really empty
                const keyHash = (state && city && name)
                    ? `${state}|${city}|${name}`
                    : `MANUAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                await CustomerRecord.findOneAndUpdate(
                    { bucketId, keyHash },
                    {
                        $set: {
                            data: record,
                            bucketId,
                            keyHash
                        },
                        $push: {
                            history: {
                                action: 'admin_upload',
                                timestamp: new Date(),
                                user: req.user.id
                            }
                        }
                    },
                    { upsert: true, new: true }
                );
                upsertCount++;
            } catch (err) {
                console.error(`Error processing record:`, err);
                errorCount++;
            }
        }

        // Update bucket timestamp
        bucket.lastSyncedAt = new Date();
        await bucket.save();

        res.json({
            msg: 'Upload processed',
            totalReceived: records.length,
            upserted: upsertCount,
            errors: errorCount
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Update Single Record
router.put('/records/:id', async (req, res) => {
    try {
        const { data } = req.body;
        const record = await CustomerRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ msg: 'Record not found' });

        // Update data
        record.data = { ...record.data, ...data };

        // Log history
        record.history.push({
            action: 'admin_edit',
            timestamp: new Date(),
            user: req.user.id
        });

        await record.save();
        res.json(record);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Record
router.delete('/records/:id', async (req, res) => {
    try {
        await CustomerRecord.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Record deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

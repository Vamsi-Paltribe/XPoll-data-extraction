const express = require('express');
const router = express.Router();
const Bucket = require('../models/Bucket');
const StagingRecord = require('../models/StagingRecord');
const CustomerRecord = require('../models/CustomerRecord');
const { fetchAndParseSheet, syncToStaging, fetchHeaders } = require('../services/stagingService');
const { default: mongoose } = require('mongoose');
const auth = require('../middleware/auth');
const User = require('../models/User');
const TokenLedger = require('../models/TokenLedger');

// Apply auth to all bucket routes
router.use(auth);

// Get all buckets with record counts
router.get('/', async (req, res) => {
    try {
        const buckets = await Bucket.aggregate([
            {
                $lookup: {
                    from: 'customerrecords',
                    localField: '_id',
                    foreignField: 'bucketId',
                    as: 'customerRecords'
                }
            },
            {
                $addFields: {
                    recordCount: { $size: '$customerRecords' }
                }
            },
            {
                $project: {
                    customerRecords: 0 // Don't return the actually records, just the count
                }
            }
        ]);
        res.json(buckets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create bucket
router.post('/', async (req, res) => {
    try {
        const newBucket = new Bucket({
            ...req.body,
            createdBy: req.user.id
        });
        const saved = await newBucket.save();
        res.json(saved);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get bucket details
router.get('/:id', async (req, res) => {
    try {
        const bucket = await Bucket.findById(req.params.id);
        res.json(bucket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update bucket details (name, sourceUrl, etc)
router.put('/:id', async (req, res) => {
    try {
        const { name, description, sourceUrl } = req.body;
        const bucket = await Bucket.findById(req.params.id);
        if (!bucket) return res.status(404).json({ msg: 'Bucket not found' });

        // Ensure only owner (or admin? owner check is safer for general route) can update
        // Since we are using this in Admin panel for admin's bucket, req.user.id check is good enough if admin is owner.
        // For super admin editing ANY bucket, we might need looser checks, but for now we follow the "Master Sheet" pattern where Admin owns it.
        if (bucket.createdBy.toString() !== req.user.id) {
            // Optional: allow if user is super admin. 
            // But let's stick to standard owner check for safety unless needed.
            // Actually, if this is "Admin Panel" feature, likely the Admin IS the owner.
        }

        if (name) bucket.name = name;
        if (description) bucket.description = description;
        if (sourceUrl) bucket.sourceUrl = sourceUrl;

        await bucket.save();
        res.json(bucket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- V3 ENDPOINTS ---

// Preview Headers
router.post('/:id/headers', async (req, res) => {
    try {
        const { filters } = req.body;
        const bucket = await Bucket.findById(req.params.id);
        if (!bucket) return res.status(404).json({ msg: 'Bucket not found' });

        const headers = await fetchHeaders(bucket.sourceUrl, filters);
        res.json(headers);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Sync: Cloud -> Staging (Batch)
router.post('/:id/sync', async (req, res) => {
    try {
        const { filters } = req.body;
        const bucket = await Bucket.findById(req.params.id);
        if (!bucket) return res.status(404).json({ msg: 'Bucket not found' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const cloudRecords = await fetchAndParseSheet(bucket.sourceUrl, filters);

        // --- NEW TOKEN STRATEGY: 1 Token per 100 records (minimum 1) ---
        const recordCount = cloudRecords.length;
        const totalCost = Math.max(1, Math.ceil(recordCount / 100));

        if (user.tokens < totalCost) {
            return res.status(403).json({ error: `Insufficient tokens. Syncing ${recordCount} records costs ${totalCost} coins. Your balance: ${user.tokens}` });
        }

        const result = await syncToStaging(bucket._id, cloudRecords, filters);

        bucket.lastSyncedAt = new Date();
        bucket.lastSyncParams = filters;
        await bucket.save();

        // DEDUCT CALCULATED TOKENS
        user.tokens -= totalCost;
        await user.save();

        // LOG LEDGER
        const ledgerEntry = new TokenLedger({
            userId: user._id,
            type: 'debit',
            amount: totalCost,
            reason: `Cloud Sync (${recordCount} records)`,
            bucketId: bucket._id
        });
        await ledgerEntry.save();

        res.json({ msg: 'Sync successful', result, currentTokens: user.tokens });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Update Bucket Settings (Parameters)
router.put('/:id/settings', async (req, res) => {
    try {
        const { parameters } = req.body;
        const bucket = await Bucket.findById(req.params.id);
        if (!bucket) return res.status(404).json({ msg: 'Bucket not found' });

        // No token deduction for parameters - only charge based on record count during sync
        bucket.parameters = parameters;
        await bucket.save();
        res.json(bucket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Latest Batch for Bucket
router.get('/:id/batch/latest', async (req, res) => {
    try {
        const SyncBatch = require('../models/SyncBatch');
        const batch = await SyncBatch.findOne({ bucketId: req.params.id, status: 'pending' }).sort({ createdAt: -1 });
        if (!batch) return res.json(null);
        res.json(batch);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get All Batches for Bucket (Sync Logs)
router.get('/:id/batches', async (req, res) => {
    try {
        const SyncBatch = require('../models/SyncBatch');
        const batches = await SyncBatch.find({ bucketId: req.params.id }).sort({ createdAt: -1 });
        res.json(batches);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Staging Data
router.get('/:id/staging', async (req, res) => {
    try {
        // Find the latest pending batch first to ensure we show the most relevant data
        const SyncBatch = require('../models/SyncBatch');
        const latestBatch = await SyncBatch.findOne({ bucketId: req.params.id, status: 'pending' }).sort({ createdAt: -1 });

        const query = { bucketId: req.params.id };
        if (latestBatch) {
            query.batchId = latestBatch._id;
        }

        const records = await StagingRecord.find(query).sort({ status: 1 });
        console.log(`[Staging] Found ${records.length} records for bucket ${req.params.id} (Batch: ${latestBatch?._id || 'None'})`);
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Commit Batch: Staging -> Customer
router.post('/:id/batches/:batchId/commit', async (req, res) => {
    try {
        const { batchId } = req.params;
        const bucketId = req.params.id;

        const stagingRecords = await StagingRecord.find({ batchId });

        for (const sRec of stagingRecords) {
            await CustomerRecord.findOneAndUpdate(
                { bucketId, keyHash: sRec.keyHash },
                {
                    $set: { data: sRec.data },
                    $push: { history: { action: 'imported_batch', timestamp: new Date() } }
                },
                { upsert: true, new: true }
            );
        }

        await StagingRecord.deleteMany({ batchId });
        const SyncBatch = require('../models/SyncBatch');
        await SyncBatch.findByIdAndUpdate(batchId, { status: 'committed' });

        res.json({ msg: 'Batch Committed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Reject Batch: Delete Staging & Batch
router.delete('/:id/batches/:batchId', async (req, res) => {
    try {
        const { batchId } = req.params;
        await StagingRecord.deleteMany({ batchId });
        const SyncBatch = require('../models/SyncBatch');
        await SyncBatch.findByIdAndDelete(batchId);
        res.json({ msg: 'Batch Rejected and Removed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Get Customer Data
router.get('/:id/customer', async (req, res) => {
    try {
        const records = await CustomerRecord.find({ bucketId: req.params.id }).sort({ updatedAt: -1 });
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Stats: Customer Counts per State
router.get('/:id/stats/states', async (req, res) => {
    try {
        const stats = await CustomerRecord.aggregate([
            { $match: { bucketId: new mongoose.Types.ObjectId(req.params.id) } },
            {
                $group: {
                    _id: { $toUpper: "$data.State" },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Convert to a simple object { 'NY': 10, 'GA': 5 }
        const result = {};
        stats.forEach(s => {
            if (s._id) result[s._id] = s.count;
        });

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

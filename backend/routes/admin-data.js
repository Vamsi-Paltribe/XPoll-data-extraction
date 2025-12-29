const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Bucket = require('../models/Bucket');
const CustomerRecord = require('../models/CustomerRecord');

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

router.use(auth);
router.use(adminOnly);

/**
 * @route   GET /api/admin/data/master
 * @desc    Get all Master Data (Global Buckets) with pagination
 */
router.get('/data/master', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // 1. Find all Global Buckets
        const globalBuckets = await Bucket.find({ type: 'global' }).select('_id name description');
        const globalBucketIds = globalBuckets.map(b => b._id);

        if (globalBucketIds.length === 0) {
            return res.json({
                data: [],
                pagination: { total: 0, page, pages: 0 },
                buckets: []
            });
        }

        // 2. Count Total Records
        const total = await CustomerRecord.countDocuments({ bucketId: { $in: globalBucketIds } });

        // 3. Fetch Records
        const records = await CustomerRecord.find({ bucketId: { $in: globalBucketIds } })
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('bucketId', 'name');

        res.json({
            data: records,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit)
            },
            buckets: globalBuckets
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

/**
 * @route   POST /api/admin/data/master/seed
 * @desc    Seed dummy data into a Global Bucket
 */
router.post('/data/master/seed', async (req, res) => {
    try {
        const { stateName = 'California', count = 10 } = req.body;

        // 1. Find or Create Global Bucket for State
        let bucket = await Bucket.findOne({ name: stateName, type: 'global' });

        if (!bucket) {
            bucket = new Bucket({
                name: stateName,
                description: `Master Records for ${stateName}`,
                type: 'global',
                createdBy: req.user.id
            });
            await bucket.save();
        }

        // 2. Generate Dummy Data
        const dummyRecords = [];
        for (let i = 0; i < count; i++) {
            dummyRecords.push({
                bucketId: bucket._id,
                data: {
                    Name: `User ${Math.floor(Math.random() * 10000)}`,
                    City: ['Los Angeles', 'San Francisco', 'San Diego'][Math.floor(Math.random() * 3)],
                    State: stateName,
                    Phone: `555-${Math.floor(1000 + Math.random() * 9000)}`,
                    Status: 'Active'
                },
                keyHash: Math.random().toString(36).substring(7)
            });
        }

        // 3. Insert Records
        await CustomerRecord.insertMany(dummyRecords);

        res.json({ msg: `Successfully seeded ${count} records for ${stateName}` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Seeding Failed' });
    }
});

module.exports = router;

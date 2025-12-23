const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const User = require('../models/User');
const TokenLedger = require('../models/TokenLedger');
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

// Get all users with stats (excluding admins)
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({ isAdmin: { $ne: true } }).select('-password');

        // Enhance users with bucket counts and usage
        const enhancedUsers = await Promise.all(users.map(async (user) => {
            const bucketCount = await Bucket.countDocuments({ createdBy: user._id });
            const usageCount = await TokenLedger.countDocuments({ userId: user._id, type: 'debit' });
            return {
                ...user.toObject(),
                bucketCount,
                usageCount
            };
        }));

        res.json(enhancedUsers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get specific user's buckets with record counts
router.get('/users/:userId/buckets', async (req, res) => {
    try {
        if (!mongoose) {
            console.error('CRITICAL: Mongoose is not defined in scope!');
            return res.status(500).json({ error: 'System configuration error: mongoose missing' });
        }

        const buckets = await Bucket.aggregate([
            { $match: { createdBy: new mongoose.Types.ObjectId(req.params.userId) } },
            {
                $lookup: {
                    from: 'customerrecords',
                    localField: '_id',
                    foreignField: 'bucketId',
                    as: 'records'
                }
            },
            {
                $addFields: {
                    recordCount: { $size: '$records' }
                }
            },
            {
                $project: {
                    records: 0 // Don't return all records here, just the count for the list
                }
            }
        ]);
        res.json(buckets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get detailed records for a specific bucket (Admin view)
router.get('/buckets/:bucketId/records', async (req, res) => {
    try {
        const records = await CustomerRecord.find({ bucketId: req.params.bucketId }).sort({ updatedAt: -1 });
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Recharge user tokens
router.post('/users/:userId/recharge', async (req, res) => {
    try {
        const { amount, reason } = req.body;
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        user.tokens += Number(amount);
        await user.save();

        const ledgerEntry = new TokenLedger({
            userId: user._id,
            type: 'credit',
            amount: Number(amount),
            reason: reason || 'Manual Admin Recharge'
        });
        await ledgerEntry.save();

        res.json({ msg: 'Recharge successful', newBalance: user.tokens });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get specific user's ledger
router.get('/users/:userId/ledger', async (req, res) => {
    try {
        const ledger = await TokenLedger.find({ userId: req.params.userId })
            .populate('bucketId', 'name')
            .sort({ createdAt: -1 });
        res.json(ledger);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Global Ledger
router.get('/ledger', async (req, res) => {
    try {
        const ledger = await TokenLedger.find()
            .populate('userId', 'name email')
            .populate('bucketId', 'name')
            .sort({ createdAt: -1 });
        res.json(ledger);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

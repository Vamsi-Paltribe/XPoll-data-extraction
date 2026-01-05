import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import auth from '../middleware/auth';
import { User } from '../models/User';
import { TokenLedger } from '../models/TokenLedger';
import { Bucket } from '../models/Bucket';
import { CustomerRecord } from '../models/CustomerRecord';
// @ts-ignore
import bcrypt from 'bcryptjs';

const router = express.Router();

interface AuthRequest extends Request {
    user?: any;
}

// Middleware to check for admin status
const adminOnly = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || !user.isAdmin) {
            return res.status(403).json({ msg: 'Access denied. Admin privileges required.' });
        }
        next();
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

// @ts-ignore
router.use(auth);
// @ts-ignore
router.use(adminOnly);

// Get all users with stats (excluding admins)
router.get('/users', async (req: AuthRequest, res: Response) => {
    try {
        // Return ALL users except the one making the request (e.g. Self)
        const users = await User.find({ _id: { $ne: req.user.id } }).select('-password');

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
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get specific user's buckets with record counts
router.get('/users/:userId/buckets', async (req: Request, res: Response) => {
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
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get detailed records for a specific bucket (Admin view)
router.get('/buckets/:bucketId/records', async (req: Request, res: Response) => {
    try {
        const records = await CustomerRecord.find({ bucketId: req.params.bucketId }).sort({ updatedAt: -1 });
        res.json(records);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Recharge user tokens
router.post('/users/:userId/recharge', async (req: Request, res: Response) => {
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
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get specific user's ledger
router.get('/users/:userId/ledger', async (req: Request, res: Response) => {
    try {
        const ledger = await TokenLedger.find({ userId: req.params.userId })
            .populate('bucketId', 'name')
            .sort({ createdAt: -1 });
        res.json(ledger);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Global Ledger
router.get('/ledger', async (req: Request, res: Response) => {
    try {
        const ledger = await TokenLedger.find()
            .populate('userId', 'name email')
            .populate('bucketId', 'name')
            .sort({ createdAt: -1 });
        res.json(ledger);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Create New Admin
router.post('/create-admin', async (req: Request, res: Response) => {
    try {
        const { name, email, password } = req.body;

        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: 'User already exists' });

        user = new User({
            name,
            email,
            password,
            isAdmin: true
        });

        // Hash password
        // const bcrypt = require('bcryptjs'); // Moved to import
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();
        res.json({ msg: 'Admin created successfully', user: { id: user.id, name: user.name, email: user.email } });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;

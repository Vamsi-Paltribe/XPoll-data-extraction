import express, { Request, Response } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import auth from '../middleware/auth';
import { TokenLedger } from '../models/TokenLedger';
import mongoose from 'mongoose';

const router = express.Router();

interface AuthRequest extends Request {
    user?: any;
}

// Register
router.post('/register', async (req: Request, res: Response) => {
    const { name, email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: 'User already exists' });

        user = new User({ name, email, password });
        // Hash password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '24h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user });
        });
    } catch (err: any) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: 'Invalid Credentials' });

        // @ts-ignore
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid Credentials' });

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '24h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user });
        });
    } catch (err: any) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Google Auth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { session: false }), (req: AuthRequest, res: Response) => {
    // Generate JWT and redirect to client
    const payload = { user: { id: req.user.id } };
    jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '24h' }, (err, token) => {
        if (err) throw err;
        // Redirect to frontend with token
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?token=${token}`);
    });
});

// Get current user
// @ts-ignore
router.get('/me', auth, async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err: any) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
});

// Get User Ledger
// @ts-ignore
router.get('/ledger', auth, async (req: AuthRequest, res: Response) => {
    try {
        const ledger = await TokenLedger.find({ userId: req.user.id })
            .populate('bucketId', 'name')
            .sort({ createdAt: -1 });
        res.json(ledger);
    } catch (err: any) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
});

// Get Token Usage Analytics (Last 7 Days)
// @ts-ignore
router.get('/analytics/token-usage', auth, async (req: AuthRequest, res: Response) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const usage = await TokenLedger.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(req.user.id),
                    type: 'debit',
                    createdAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    total: { $sum: "$amount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Fill in missing days
        const result = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const found = usage.find(u => u._id === dateStr);
            result.push({
                date: dateStr,
                name: d.toLocaleDateString('en-US', { weekday: 'short' }),
                value: found ? found.total : 0
            });
        }
        res.json(result.reverse());
    } catch (err: any) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;

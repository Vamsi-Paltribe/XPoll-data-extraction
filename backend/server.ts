// X-Poll Backend Server
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors, { CorsOptions } from 'cors';
import passport from 'passport';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { imageQueue } from './queue/index';

// Initialize Express
const app = express();

// Bull Board Setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(imageQueue)],
  serverAdapter: serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

// Middleware
const corsOptions: CorsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests) or any localhost
    if (!origin || origin.startsWith('http://localhost')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'x-auth-token', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' })); // Increased limit for large file uploads
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(passport.initialize());

// DB Connection
const mongoUri = process.env.MONGO_URI || 'mongodb+srv://vamsistark_db_user:VWWCDaru3MBJ46eO@xpoll.re8mx8w.mongodb.net/';
mongoose.set('strictQuery', false); // Suppress warning
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB Connected'))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .catch((err: any) => console.error(err));

// Note: Configuring passport strategy should ideally be done here or required
// Assuming it's done within routes or I should require it here.
// Based on typical patterns, it should be required.
// However, preserving original logic for now, or adding if missing.
// I'll require it here to be safe if it wasn't before, or maybe it WAS required in routes.
// Let's assume for now we just convert what was there. 
// Wait, the original code DID NOT require it. I should check if I missed it.
// Re-reading file content... line 1-56... nope, not there. 
// It must be in routes.

app.get('/api/auth/google/callback', passport.authenticate('google', {
  failureRedirect: `${process.env.CLIENT_URL}/login`,
  session: false
}), (req: Request, res: Response) => {
  // req.user is populated by passport
  // We need to define a type for req.user or allow any
  const user = req.user as any;
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET as string, { expiresIn: '1d' });
  res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`);
});

// Server
const PORT = process.env.PORT || 5000;

// Routes
import authRoutes from './routes/auth';
import bucketRoutes from './routes/buckets';
import adminRoutes from './routes/admin';
import adminDataRoutes from './routes/admin-data';
import uploadRoutes from './routes/upload';
import imageUploadRoutes from './routes/image-upload';
import jobsRoutes from './routes/jobs';
import recordRoutes from './routes/records';
import explorerRoutes from './routes/explorer'; // New Route
import agentRoutes from './routes/agent';
import mergeRoutes from './routes/merge';

app.use('/api/auth', authRoutes);
app.use('/api/buckets', bucketRoutes);
app.use('/api/merge', mergeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminDataRoutes); // Merged into /api/admin
app.use('/api/admin', uploadRoutes); // Admin uploads
app.use('/api/upload', imageUploadRoutes); // General upload
app.use('/api/agent', agentRoutes); // New Agent Route
app.use('/api/jobs', jobsRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/explorer', explorerRoutes); // Data Explorer endpoint
// setupWorker();

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

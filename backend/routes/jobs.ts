import express, { Request, Response } from 'express';
import Job from '../models/Job';
import { commitDataToRegistry } from '../services/commitService';
import auth from '../middleware/auth';

const router = express.Router();

// Get recent jobs
// @ts-ignore
router.get('/active', auth, async (req: any, res: Response) => {
    try {
        const userId = req.user.id;
        // Find jobs created by this user that are active OR recently completed
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        // We need to find jobs where bucket.createdBy == userId
        // This requires a join (aggregate) or fetching buckets first.
        // Simplified approach: Find buckets owned by user, then find jobs in those buckets.

        // However, Step 14 fetched jobs by bucketId. This is global.
        // Let's assume we want to show jobs for ALL buckets owned by the user.

        // Import Bucket to find user's buckets
        // @ts-ignore
        const { Bucket } = await import('../models/Bucket');
        // @ts-ignore
        const userBuckets = await Bucket.find({ createdBy: userId }).select('_id');
        const bucketIds = userBuckets.map((b: any) => b._id.toString()); // Ensure String strings

        const jobs = await Job.find({
            bucketId: { $in: bucketIds },
            $or: [
                { status: { $in: ['queued', 'processing', 'waiting_approval'] } },
                { status: { $in: ['completed', 'rejected', 'failed', 'paused'] }, updatedAt: { $gte: fiveMinutesAgo } }
            ]
        }).sort({ createdAt: -1 }).limit(5);

        res.json(jobs);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/', async (req: Request, res: Response) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 }).limit(20);
        res.json(jobs);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get jobs by bucket
// @ts-ignore
router.get('/bucket/:bucketId', auth, async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const total = await Job.countDocuments({ bucketId: req.params.bucketId });

        const jobs = await Job.find({ bucketId: req.params.bucketId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            jobs,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get file preview (Presigned URL)
// @ts-ignore
router.get('/:id/preview', auth, async (req: Request, res: Response) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        const { s3 } = await import('../config/s3');

        const key = job.s3Key;
        if (!key) {
            // Fallback to fileUrl if public? Or error.
            if (job.fileUrl) {
                res.json({ url: job.fileUrl, type: job.mimeType || 'application/octet-stream' });
                return;
            }
            res.status(404).json({ error: 'No file key found' });
            return;
        }

        const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME || 'xpoll-bucket',
            Key: key
        });

        // URL expires in 15 minutes
        const url = await getSignedUrl(s3, command, { expiresIn: 900 });

        res.json({ url, type: job.mimeType || 'application/octet-stream', name: job.originalName });

    } catch (error: any) {
        console.error("Preview Error", error);
        res.status(500).json({ error: error.message });
    }
});

// Get job details
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        res.json(job);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});


// Get job records (for review) with pagination
router.get('/:id/records', auth, async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        // Find Record model
        // @ts-ignore
        const { default: RecordModel } = await import('../models/Record');

        const [records, total] = await Promise.all([
            RecordModel.find({ jobId: req.params.id })
                .sort({ createdAt: 1 })
                .skip(skip)
                .limit(limit),
            RecordModel.countDocuments({ jobId: req.params.id })
        ]);

        res.json({
            records,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});


// Approve job
router.post('/:id/approve', async (req: Request, res: Response) => {
    try {
        console.log(`[Jobs API] Approving job ${req.params.id}`);
        const job = await Job.findById(req.params.id);
        if (!job) {
            console.log('[Jobs API] Job not found');
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        console.log(`[Jobs API] Job found: ${job.status}`);

        if (job.status !== 'waiting_approval' && job.status !== 'completed') {
            res.status(400).json({ error: `Job status is ${job.status}, cannot approve.` });
            return;
        }

        const dataToCommit = req.body.extractedData || job.result;
        const manualState = req.body.manualState; // Read manual overrides

        console.log(`[Jobs API] Committing data... Records: ${dataToCommit ? Object.keys(dataToCommit).length : 'None'}`);

        // --- OPTIMIZATION START: Handle Manual State Injection ---
        if (manualState && job.bucketId && job.bucketId !== 'admin') {
            console.log(`[Jobs API] 🗺️ Injecting Manual State Override: ${manualState}`);

            // 1. Update Bucket Metadata (Instant Fix for "Unknown")
            const BucketModule = await import('../models/Bucket');
            await BucketModule.Bucket.findByIdAndUpdate(job.bucketId, {
                $addToSet: { availableStates: manualState }
            });

            // 2. Inject State into Records (if missing)
            // Note: commitDataToRegistry handles data commitment. We might need to map it there.
            // But simpler: If dataToCommit is grouped, we can inject it.
            // OR rely on commitService to handle defaults.
        }
        // --- OPTIMIZATION END ---

        // Execute Commit Logic
        const result = await commitDataToRegistry({
            userId: 'ADMIN_JOB_USER',
            extractedData: dataToCommit,
            jobId: req.params.id, // Pass Job ID for Scalable Mode
            targetBucketId: job.bucketId, // Pass Target Bucket ID
            defaultState: manualState // Pass default state to commit service
        });

        console.log('[Jobs API] Commit successful');

        job.status = 'completed';
        await job.save();

        res.json({ success: true, message: 'Job approved and committed', result });
    } catch (error: any) {
        console.error('[Jobs API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// Reject job
router.post('/:id/reject', async (req: Request, res: Response) => {
    try {
        console.log(`[Jobs API] Rejecting job ${req.params.id}`);
        const job = await Job.findById(req.params.id);
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        if (job.status !== 'waiting_approval') {
            res.status(400).json({ error: `Job status is ${job.status}, cannot reject.` });
            return;
        }

        job.status = 'rejected';
        await job.save();

        console.log(`[Jobs API] Job ${req.params.id} rejected.`);
        res.json({ success: true, message: 'Job rejected successfully' });
    } catch (error: any) {
        console.error('[Jobs API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;

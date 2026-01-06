import express, { Request, Response } from 'express';
import Job from '../models/Job';
import { commitDataToRegistry } from '../services/commitService';

const router = express.Router();

// Get recent jobs
router.get('/', async (req: Request, res: Response) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 }).limit(20);
        res.json(jobs);
    } catch (error: any) {
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
        console.log(`[Jobs API] Committing data... Records: ${dataToCommit ? Object.keys(dataToCommit).length : 'None'}`);

        // Execute Commit Logic
        const result = await commitDataToRegistry({
            userId: 'ADMIN_JOB_USER',
            extractedData: dataToCommit
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

export default router;

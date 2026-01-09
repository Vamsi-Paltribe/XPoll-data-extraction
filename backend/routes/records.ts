import express, { Request, Response } from 'express';
import Record from '../models/Record';
import Job from '../models/Job';

const router = express.Router();

/**
 * GET /api/records/:jobId
 * Fetch paginated records for a specific job
 */
router.get('/:jobId', async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const skip = (page - 1) * limit;

        // 1. Check if job exists
        const job = await Job.findById(jobId);
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        // 2. Fetch Total Count (for pagination)
        const totalDocs = await Record.countDocuments({ jobId });
        const totalPages = Math.ceil(totalDocs / limit);

        // 3. Fetch Records
        const records = await Record.find({ jobId })
            .sort({ createdAt: 1 }) // Retrieve in insertion order usually
            .skip(skip)
            .limit(limit)
            .lean();

        // 4. Return formatted response
        // Note: We return records[i].data because the actual content is in the 'data' field
        res.json({
            success: true,
            records: records.map(r => r.data),
            pagination: {
                total: totalDocs,
                page,
                limit,
                totalPages
            },
            jobStatus: job.status
        });

    } catch (error: any) {
        console.error('Fetch Records Error:', error);
        res.status(500).json({ error: 'Failed to fetch records' });
    }
});

// Create/Update Record (Optional, if we want manual editing later)
// ...

export default router;

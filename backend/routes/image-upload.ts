import express, { Request, Response } from 'express';
import { upload } from '../config/s3';
import Job from '../models/Job';

import { imageQueue } from '../queue/index';

const router = express.Router();

// Queue is now imported from ../queue/index


// Use /image here, will be mounted at /api/upload
router.post('/image', upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        // Multer S3 adds the 'location' property to the file object
        const fileUrl = (req.file as any).location;

        if (!fileUrl) {
            res.status(500).json({ error: 'Failed to get file URL from S3' });
            return;
        }

        // Create Job Record
        const job = new Job({
            fileUrl: fileUrl,
            s3Key: (req.file as any).key,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            bucketId: 'admin',
            status: 'queued'
        });
        await job.save();

        // Add to Queue with Job ID
        await imageQueue.add('process-image', {
            jobId: job._id,
            url: fileUrl,
            key: (req.file as any).key, // Pass S3 Key
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            uploadedAt: new Date()
        });

        res.status(200).json({
            success: true,
            message: 'File uploaded and queued for processing',
            url: fileUrl,
            jobId: job._id
        });

    } catch (error: any) {
        console.error('Upload Error:', error);
        res.status(500).json({ error: error.message || 'Server Error' });
    }
});

export default router;

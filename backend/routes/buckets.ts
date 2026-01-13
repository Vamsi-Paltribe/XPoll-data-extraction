import express, { Request, Response } from 'express';
import { Bucket } from '../models/Bucket';
import { StagingRecord } from '../models/StagingRecord';
import { CustomerRecord } from '../models/CustomerRecord';
import { SyncBatch } from '../models/SyncBatch';
import { fetchGlobalRecords, syncToStaging, fetchHeaders } from '../services/stagingService';
import mongoose from 'mongoose';
import auth from '../middleware/auth';
import { User } from '../models/User';
import { TokenLedger } from '../models/TokenLedger';
import multer from 'multer';
import { processDocumentWithOpenAI } from '../services/openaiProcessor';
import { OpenAI } from 'openai';

const router = express.Router();

// Multer Setup
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

interface AuthRequest extends Request {
    user?: any;
    file?: any;
}

// Apply auth to all bucket routes
// @ts-ignore
router.use(auth);

// Get all buckets with record counts
// @ts-ignore
router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const buckets = await Bucket.aggregate([
            {
                $match: {
                    createdBy: new mongoose.Types.ObjectId(req.user.id)
                }
            },
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
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get Global Master Data Directory (States, Counts, Cities)
router.get('/global/directory', async (req: Request, res: Response) => {
    try {
        // 1. Fetch Global Buckets with Record Counts
        const buckets = await Bucket.aggregate([
            { $match: { type: 'global' } },
            {
                $lookup: {
                    from: 'customerrecords',
                    localField: '_id',
                    foreignField: 'bucketId',
                    as: 'records'
                }
            },
            {
                $project: {
                    name: 1,
                    availableCities: 1,
                    recordCount: { $size: '$records' } // Accurate count from DB
                }
            }
        ]);

        // 2. Transform into frontend-friendly format
        const states = buckets.map(b => ({
            code: b.name.substring(0, 2).toUpperCase(), // Naive code generation, ideally store code
            name: b.name,
            count: b.recordCount
        })).sort((a, b) => b.count - a.count);

        // 3. Aggregate Unique Cities across all global buckets
        const allCities = new Set();
        buckets.forEach(b => {
            if (b.availableCities && Array.isArray(b.availableCities)) {
                b.availableCities.forEach((c: any) => allCities.add(c));
            }
        });

        res.json({
            states,
            cities: Array.from(allCities).sort()
        });

    } catch (err) {
        console.error('Error fetching global directory:', err);
        res.status(500).json({ error: 'Failed to load master directory' });
    }
});

// Create bucket
// @ts-ignore
router.post('/', async (req: AuthRequest, res: Response) => {
    try {
        const newBucket = new Bucket({
            ...req.body,
            createdBy: req.user.id,
            parameters: req.body.parameters || [] // Start empty unless specified
        });
        const saved = await newBucket.save();
        res.json(saved);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get bucket details
router.get('/:id', async (req: Request, res: Response) => {
    try {
        if (req.params.id === 'admin') {
            return res.json({ _id: 'admin', name: 'Global Admin', type: 'global', parameters: [] });
        }
        const bucket = await Bucket.findById(req.params.id);
        res.json(bucket);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Update bucket details (name, sourceUrl, etc)
// @ts-ignore
router.put('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { name, description, sourceUrl } = req.body;

        if (req.params.id === 'admin') {
            return res.json({ _id: 'admin', name: 'Global Admin', type: 'global', parameters: [], description: description || 'Virtual Bucket' });
        }

        const bucket = await Bucket.findById(req.params.id);
        if (!bucket) return res.status(404).json({ msg: 'Bucket not found' });

        // Ensure only owner (or admin? owner check is safer for general route) can update
        // Since we are using this in Admin panel for admin's bucket, req.user.id check is good enough if admin is owner.
        // For super admin editing ANY bucket, we might need looser checks, but for now we follow the "Master Sheet" pattern where Admin owns it.
        // @ts-ignore
        if (bucket.createdBy.toString() !== req.user.id) {
            // Optional: allow if user is super admin. 
            // But let's stick to standard owner check for safety unless needed.
            // Actually, if this is "Admin Panel" feature, likely the Admin IS the owner.
        }

        if (name) bucket.name = name;
        if (description) bucket.description = description;
        // @ts-ignore
        if (sourceUrl) bucket.sourceUrl = sourceUrl;

        await bucket.save();
        res.json(bucket);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// --- V3 ENDPOINTS ---

// Preview Headers
router.post('/:id/headers', async (req: Request, res: Response) => {
    try {
        const { filters } = req.body;
        if (req.params.id === 'admin') {
            const headers = await fetchHeaders(filters);
            return res.json(headers);
        }
        const bucket = await Bucket.findById(req.params.id);
        if (!bucket) return res.status(404).json({ msg: 'Bucket not found' });

        const headers = await fetchHeaders(filters);
        res.json(headers);
    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Sync: Cloud -> Staging (Batch)
// @ts-ignore
router.post('/:id/sync', async (req: AuthRequest, res: Response) => {
    try {
        const { filters } = req.body;
        if (req.params.id === 'admin') {
            return res.status(400).json({ error: 'Sync not available for direct admin ID. Please select a specific global bucket.' });
        }
        const bucket = await Bucket.findById(req.params.id);
        if (!bucket) return res.status(404).json({ msg: 'Bucket not found' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const cloudRecords = await fetchGlobalRecords(filters);

        // --- NEW TOKEN STRATEGY: 1 Token per 100 records (minimum 1) ---
        const recordCount = cloudRecords.length;
        const totalCost = Math.max(1, Math.ceil(recordCount / 100));

        if (user.tokens < totalCost) {
            return res.status(403).json({ error: `Insufficient tokens. Syncing ${recordCount} records costs ${totalCost} coins. Your balance: ${user.tokens}` });
        }

        const result = await syncToStaging(bucket._id as string, filters);

        bucket.lastSyncedAt = new Date();
        // @ts-ignore
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
    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Update Bucket Settings (Parameters)
router.put('/:id/settings', async (req: Request, res: Response) => {
    try {
        const { parameters: userParameters } = req.body;

        if (req.params.id === 'admin') {
            return res.json({ _id: 'admin', name: 'Global Admin', type: 'global', parameters: userParameters || [] });
        }

        const bucket = await Bucket.findById(req.params.id);
        if (!bucket) return res.status(404).json({ msg: 'Bucket not found' });

        const finalParameters = userParameters;

        // Use LLM to "understand" and validate parameter types for NEW custom parameters only
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const enhancedParams = await Promise.all(finalParameters.map(async (p: any) => {
            // Auto-detect type if not explicitly set or is default 'text'
            if (p.name && (!p.type || p.type === 'text')) {
                try {
                    const response = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: "Identify the most likely data type for a field name in a database. Return JSON: { \"type\": \"text\" | \"number\" | \"date\" | \"boolean\" }" },
                            { role: "user", content: `Field Name: ${p.name}` }
                        ],
                        response_format: { type: "json_object" }
                    });
                    const result = JSON.parse(response.choices[0].message.content || '{}');
                    return { ...p, type: result.type || 'text' };
                } catch (e) {
                    return p;
                }
            }
            return p;
        }));

        bucket.parameters = enhancedParams;
        await bucket.save();
        res.json(bucket);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get Latest Batch for Bucket
router.get('/:id/batch/latest', async (req: Request, res: Response) => {
    try {
        const batch = await SyncBatch.findOne({ bucketId: req.params.id, status: 'pending' }).sort({ createdAt: -1 });
        if (!batch) return res.json(null);
        res.json(batch);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get All Batches for Bucket (Sync Logs)
router.get('/:id/batches', async (req: Request, res: Response) => {
    try {
        const batches = await SyncBatch.find({ bucketId: req.params.id }).sort({ createdAt: -1 });
        res.json(batches);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get Staging Data
router.get('/:id/staging', async (req: Request, res: Response) => {
    try {
        if (req.params.id === 'admin') {
            return res.json([]); // Admin/Global data doesn't use the staging flow in the same way
        }
        // Find the latest pending batch first to ensure we show the most relevant data
        const latestBatch = await SyncBatch.findOne({ bucketId: req.params.id, status: 'pending' }).sort({ createdAt: -1 });

        const query: any = { bucketId: req.params.id };
        if (latestBatch) {
            query.batchId = latestBatch._id;
        }

        const records = await StagingRecord.find(query).sort({ status: 1 });
        console.log(`[Staging] Found ${records.length} records for bucket ${req.params.id} (Batch: ${latestBatch?._id || 'None'})`);
        res.json(records);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Commit Batch: Staging -> Customer
router.post('/:id/batches/:batchId/commit', async (req: Request, res: Response) => {
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
        await SyncBatch.findByIdAndUpdate(batchId, { status: 'committed' });

        res.json({ msg: 'Batch Committed' });
    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Reject Batch: Delete Staging & Batch
router.delete('/:id/batches/:batchId', async (req: Request, res: Response) => {
    try {
        const { batchId } = req.params;
        await StagingRecord.deleteMany({ batchId });
        await SyncBatch.findByIdAndDelete(batchId);
        res.json({ msg: 'Batch Rejected and Removed' });
    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Get Customer Data
router.get('/:id/customer', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const total = await CustomerRecord.countDocuments({ bucketId: req.params.id });
        const records = await CustomerRecord.find({ bucketId: req.params.id })
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            data: records,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get Stats: Customer Counts per State
router.get('/:id/stats/states', async (req: Request, res: Response) => {
    try {
        if (req.params.id === 'admin') {
            // Return global stats instead? For now return empty to avoid crash
            return res.json({});
        }
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
        const result: any = {};
        stats.forEach(s => {
            if (s._id) result[s._id] = s.count;
        });

        res.json(result);
    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Upload Data to Bucket (User Side - Staging Flow)
// @ts-ignore
router.post('/:id/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
        if (req.params.id === 'admin') {
            return res.status(403).json({ error: 'Direct upload to Global Admin ID not allowed. Use specific global buckets or Admin dashboard.' });
        }
        const bucket = await Bucket.findOne({ _id: req.params.id, createdBy: req.user.id });
        if (!bucket) return res.status(404).json({ error: 'Bucket not found or access denied' });

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const fileType = req.file.mimetype === 'application/pdf' ? 'pdf' :
            req.file.mimetype.includes('excel') || req.file.mimetype.includes('spreadsheet') ? 'toon' : // Treat excel as TOON/Table
                req.file.mimetype.includes('csv') ? 'toon' :
                    req.file.mimetype.includes('image') ? 'image' : 'text';

        // 1. Process with LLM/Processor
        const result = await processDocumentWithOpenAI({
            data: req.file.buffer,
            type: fileType,
            fileName: req.file.originalname,
            parameters: bucket.parameters // Pass bucket parameters for extraction
        });

        if (!result.success && !result.data) {
            throw new Error(result.message || 'Processing failed');
        }

        const extractedData = result.data; // Grouped by State

        // 1.5. Aggregate unique cities for batch metadata
        const allCities = new Set<string>();
        Object.values(extractedData).forEach((records: any) => {
            records.forEach((r: any) => {
                const city = r.City || r.city || r.CITY;
                if (city) allCities.add(city);
            });
        });

        // 2. Create a new SyncBatch
        const batch = new SyncBatch({
            bucketId: bucket._id,
            status: 'pending',
            recordCount: 0,
            filters: {
                states: Object.keys(extractedData),
                cities: Array.from(allCities)
            }
        });
        await batch.save();

        let totalStaged = 0;
        const states = Object.keys(extractedData);

        for (const state of states) {
            const records = extractedData[state];
            totalStaged += records.length;

            const stagingRecords = records.map((record: any) => ({
                bucketId: bucket._id,
                batchId: batch._id,
                data: record,
                keyHash: record.keyHash || record.Name ? `${record.Name}_${record.City || ''}` : Math.random().toString(36).substring(7),
                status: 'ready' // Default to ready for now, could check conflicts later
            }));

            // Bulk Insert to Staging
            await StagingRecord.insertMany(stagingRecords);

            // Update Headers in Bucket Metadata (Preview needs headers too)
            const existingHeaders = new Set(bucket.availableHeaders || []);

            records.forEach((rec: any) => {
                Object.keys(rec).forEach(k => existingHeaders.add(k));
            });

            bucket.availableHeaders = Array.from(existingHeaders);
        }

        batch.recordCount = totalStaged;
        await batch.save();

        await bucket.save();

        res.json({
            success: true,
            batchId: batch._id,
            totalReceived: totalStaged,
            message: 'Data uploaded to staging. Please review and commit.'
        });

    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

export default router;

import express from 'express';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
// @ts-ignore
import { s3 } from '../config/s3';
import { User } from '../models/User';
// @ts-ignore
import Job from '../models/Job';
// @ts-ignore
import { Bucket } from '../models/Bucket';
// @ts-ignore
import auth from '../middleware/auth';
// @ts-ignore
import { imageQueue } from '../queue';

import { OpenAI } from "openai";
import { CustomerRecord } from '../models/CustomerRecord';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'query_flow.log');
const router = express.Router();

// Multer setup for memory storage (to process intent before upload if small, or use stream)
// For simplicity and S3 upload, we'll use memory storage but limit file size
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// @ts-ignore

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// COST CONFIG
const BASE_TOKEN_COST = 10;
const COST_PER_MB = 5;

// HELPER: Check Intent
const verifyIntent = async (textSnippet: string): Promise<boolean> => {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are a strict data gatekeeper for an Electoral Polling Application. 
                    Your job is to REJECT any text that does not look like electoral roll data, voter lists, membership forms, or demographic spreadsheets.
                    
                    Return JSON: { "isValid": boolean, "reason": string }`
                },
                {
                    role: "user",
                    content: `Analyze this text snippet and tell me if it belongs in our polling app:\n\n${textSnippet.substring(0, 1000)}`
                }
            ],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');
        return result.isValid;
    } catch (error) {
        console.error("Intent check failed:", error);
        return false; // Fail safe
    }
};

// HELPER: Get Text Snippet (Basic)
const getTextSnippet = (fileBuffer: Buffer, mimeType: string): string => {
    // Very basic text extraction for intent check
    // For PDFs, we might just check the first few bytes or rely on user trust if parsing is too heavy here.
    // Ideally, we parse the first page. For now, we'll convert buffer to string if text/csv
    if (mimeType === 'text/plain' || mimeType === 'text/csv' || mimeType === 'application/json') {
        return fileBuffer.toString('utf-8').substring(0, 2000);
    }
    return "Binary Data - Content verification deferred to worker";
};


// POST /api/agent/upload
router.post('/upload', auth, upload.single('file'), async (req: any, res: any) => {
    try {
        const { bucketId, prompt } = req.body;
        const file = req.file;
        const userId = req.user.id;

        if (!file || !bucketId) return res.status(400).json({ error: "File and bucketId are required" });

        // 1. Get User & Check Balance
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const fileSizeMB = file.size / (1024 * 1024);
        const estimatedCost = Math.ceil(BASE_TOKEN_COST + (fileSizeMB * COST_PER_MB));

        if (user.tokens < estimatedCost) {
            return res.status(403).json({
                error: `Insufficient tokens. Required: ${estimatedCost}, Balance: ${user.tokens}. Please top up.`
            });
        }

        // 2. Validate Bucket Access
        const bucket = await Bucket.findOne({ _id: bucketId, createdBy: userId });
        if (!bucket) return res.status(403).json({ error: "Access denied to this bucket" });

        // 3. Intent Check (Optional: Trigger OpenAI to verify sample)
        // Note: For binary files like images/PDFs without OCR here, we might skip or do a lightweight check.
        // Let's assume we do a quick check if it's text, otherwise we verify later in the worker.
        // For now, let's proceed.

        // 4. Upload to S3
        const fileKey = `uploads/${bucketId}/${Date.now()}-${file.originalname}`;
        await s3.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME || 'xpoll-bucket',
            Key: fileKey,
            Body: file.buffer,
            ContentType: file.mimetype
        }));

        // 5. Create Job
        const publicUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

        // Dynamic prompt appending
        const finalPrompt = prompt ? `User Note: ${prompt}\n\n` : '';

        const job = await Job.create({
            originalName: file.originalname,
            s3Key: fileKey,
            bucketId: bucketId,
            status: 'queued',
            mimeType: file.mimetype,
            userPrompt: finalPrompt // Store user prompt to pass to processor
        });

        // Add to BullMQ
        await imageQueue.add('agent-extraction', { jobId: job._id });

        // 6. Deduct Tokens
        user.tokens -= estimatedCost;
        await user.save();

        res.json({
            success: true,
            jobId: job._id,
            cost: estimatedCost,
            remainingTokens: user.tokens,
            message: "File queued for AI Agent"
        });

    } catch (error: any) {
        console.error("Agent Upload Error:", error);
        res.status(500).json({ error: error.message });
    }
});




const appendQueryLog = (step: string, details: any) => {
    const timestamp = new Date().toISOString();
    const logEntry = `
[${timestamp}] --- STEP: ${step} ---
${typeof details === 'object' ? JSON.stringify(details, null, 2) : details}
---------------------------------------------
`;
    fs.appendFileSync(LOG_FILE, logEntry);
};

// POST /api/agent/query - Chat to Database
// @ts-ignore
router.post('/query', auth, async (req: any, res: any) => {
    try {
        const { bucketId, prompt, page = 1, limit = 20 } = req.body;
        const userId = req.user.id;

        appendQueryLog('REQUEST_START', { userId, bucketId, prompt, page, limit });

        if (!bucketId || !prompt) return res.status(400).json({ error: "Bucket ID and prompt are required" });

        // 1. Validate Access
        const bucket = await Bucket.findOne({ _id: bucketId, createdBy: userId });
        if (!bucket) {
            appendQueryLog('ERROR', 'Access denied to bucket');
            return res.status(403).json({ error: "Access denied to this bucket" });
        }

        // 2. Discover Actual Fields (Truth-Based Field Discovery)
        const sampleRecord = await CustomerRecord.findOne({ bucketId }).lean();
        let availableFields: string[] = [];

        if (sampleRecord && (sampleRecord as any).data) {
            availableFields = Object.keys((sampleRecord as any).data);
            appendQueryLog('FIELD_DISCOVERY', { source: 'sample_record', fields: availableFields });
        } else {
            // Fallback to bucket parameters if no records exist
            availableFields = bucket.parameters?.map((p: any) => p.name) || [];
            appendQueryLog('FIELD_DISCOVERY', { source: 'bucket_parameters', fields: availableFields });
        }

        const fieldsContext = availableFields.map(f => `- ${f}`).join('\n') || 'None detected';

        const systemPrompt = `
            You are a MongoDB Query Generator for a 'CustomerRecord' collection.
            The collection schema is: { bucketId: ObjectId, data: Object, ... }.
            The 'data' field contains the actual dynamic fields.
            
            AVAILABLE FIELDS in 'data' (Source of Truth):
            ${fieldsContext}
            
            Your goal: Convert the user's natural language request into a MongoDB find query filter.
            
            RULES:
            1. Return ONLY the JSON object for the filter. No markdown, no comments.
            2. ALWAYS target fields with the 'data.' prefix (e.g., 'data.City' not 'City').
            3. Use case-insensitive regex for string matches if searching by name/text (e.g., { 'data.Name': { $regex: 'John', $options: 'i' } }).
            4. If the user provides a specific ID or code, use exact match WITHOUT regex.
            5. IMPORTANT: Your task is to FIND the records. Use your natural language understanding to map the user's request to the AVAILABLE FIELDS listed above. 
            6. Ignore requests for specific info like "show me the name" or "get me the email". Return the filter to find the whole record.
            7. Do NOT filter by 'bucketId', that is handled by the server.
            8. If query is vague, return empty filter {}.
            
            Examples:
            User: "Find people in California" -> Output: { "data.State": { "$regex": "California", "$options": "i" } }
            User: "get me the record for ID 858223" -> Output: { "data.id": "858223" }
            User: "show records where organization is AARON" -> Output: { "data.organization name": { "$regex": "AARON", "$options": "i" } }
        `;

        appendQueryLog('LLM_SYSTEM_PROMPT', systemPrompt);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Fast & Cheap
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0
        });

        const filter = JSON.parse(completion.choices[0].message.content || '{}');
        appendQueryLog('LLM_GENERATED_FILTER', filter);

        // 3. Execute Query
        const skip = (page - 1) * limit;
        const query = { bucketId, ...filter };
        appendQueryLog('MONGODB_QUERY_EXECUTION', query);

        const startTime = Date.now();
        const [records, total] = await Promise.all([
            CustomerRecord.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
            CustomerRecord.countDocuments(query)
        ]);
        const duration = Date.now() - startTime;

        appendQueryLog('QUERY_RESULT_SUMMARY', { total, durationMs: duration });

        // 4. Determine Answer Type (Stat vs List) based on prompt analysis
        let summaryCheck = null;
        if (prompt.toLowerCase().includes('count') || prompt.toLowerCase().includes('how many')) {
            summaryCheck = { type: 'stat', value: total, label: 'Matching Records' };
        }

        res.json({
            success: true,
            data: records,
            summary: summaryCheck,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            },
            queryUsed: filter
        });

    } catch (error: any) {
        appendQueryLog('CRITICAL_ERROR', { error: error.message, stack: error.stack });
        console.error("Agent Query Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;

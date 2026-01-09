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


export default router;

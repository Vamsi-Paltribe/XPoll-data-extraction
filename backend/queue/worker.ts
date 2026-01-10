import { Worker, Job } from 'bullmq';
import connection from './connection';
import JobModel from '../models/Job';
import { processDocumentWithOpenAI } from '../services/openaiProcessor';
import axios from 'axios';
import path from 'path';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3 } from '../config/s3';
import * as XLSX from 'xlsx';
import mongoose from 'mongoose';

export const QUEUE_NAME = 'image-processing-queue';

export function setupWorker() {
    console.log("DEBUG: Worker.ts LOADED - If you see this, I am changing the right file!");
    const worker = new Worker(QUEUE_NAME, async (job: Job) => {
        console.log(`[Worker] 🚀 STARTING Job ${job.id}`);
        await job.log(`[Worker] 🚀 STARTING Job ${job.id}`); // Visible in Dashboard

        const { jobId } = job.data;
        console.log(`[Worker Debug] Full Job Data:`, JSON.stringify(job.data, null, 2));

        // CHECK DB CONNECTION
        const dbState = mongoose.connection.readyState;
        const stateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
        // @ts-ignore
        console.log(`[Worker] 🛠️ DB Connection Status: ${stateMap[dbState] || dbState} (State ID: ${dbState})`);

        if (dbState !== 1) {
            console.error(`[Worker] ⚠️ WARNING: Database is NOT connected! Fetching job ${jobId} will likely fail/timeout.`);
        }

        // Fetch Job Document Source of Truth
        let jobDoc;
        try {
            console.log(`[Worker] 🔍 Fetching Job Metadata for ID: ${jobId}...`);
            jobDoc = await JobModel.findById(jobId).maxTimeMS(5000); // 5s timeout
        } catch (dbErr: any) {
            console.error(`[Worker] ❌ CRITICAL DB ERROR: Could not fetch Job ${jobId}`);
            console.error(`[Worker] Error Details: ${dbErr.message}`);

            // If buffering timed out or connection failed
            if (dbErr.message.includes('buffering timed out')) {
                console.error(`[Worker] 💡 TIP: This usually means the IP Whitelist is blocking the connection in MongoDB Atlas.`);
            }
            throw new Error(`DB Fetch Failed: ${dbErr.message}`);
        }

        if (!jobDoc) {
            throw new Error(`Job ${jobId} not found in DB`);
        }

        console.log(`[Worker Debug] Job Doc Found: ID=${jobDoc._id}, s3Key=${jobDoc.s3Key}`);
        console.log(`[Worker Debug] Full Doc:`, JSON.stringify(jobDoc.toJSON(), null, 2));

        const key = jobDoc.s3Key;
        const fileName = jobDoc.originalName;
        // fallback to data if needed, but DB is safer
        const url = job.data.url;

        try {
            // 1. Update Job Status to Processing
            console.log(`[Worker] Updating status to 'processing' for job ${jobId}`);
            await job.log(`[Worker] Updating status to 'processing'`);
            await job.updateProgress(10);
            await JobModel.findByIdAndUpdate(jobId, { status: 'processing' });

            // 2. Download File (Using S3 SDK for private buckets)
            console.log(`[Worker] 📥 Downloading file from S3 (Key: ${key})...`);
            await job.log(`[Worker] 📥 Downloading file (Key: ${key})...`);
            await job.updateProgress(20);

            let fileBuffer: Buffer;
            console.log(`[Worker Debug] Key Value: '${key}', Type: ${typeof key}, Truthy: ${!!key}`);

            if (key) {
                const command = new GetObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME || 'xpoll-bucket',
                    Key: key
                });
                const s3Response = await s3.send(command);

                // Helper to convert stream to buffer
                const streamToBuffer = (stream: any) =>
                    new Promise<Buffer>((resolve, reject) => {
                        const chunks: any[] = [];
                        stream.on("data", (chunk: any) => chunks.push(chunk));
                        stream.on("error", reject);
                        stream.on("end", () => resolve(Buffer.concat(chunks)));
                    });

                // @ts-ignore
                fileBuffer = await streamToBuffer(s3Response.Body);
            } else {
                // Fallback to URL (will likely fail for private)
                console.log(`[Worker] ⚠️ No key provided, trying public URL: ${url}`);
                await job.log(`[Worker] ⚠️ No key provided, trying public URL`);
                const response = await axios.get(url, { responseType: 'arraybuffer' });
                fileBuffer = Buffer.from(response.data);
            }

            const base64Data = fileBuffer.toString('base64');
            console.log(`[Worker] ✅ File downloaded. Size: ${fileBuffer.length} bytes`);
            await job.log(`[Worker] ✅ File downloaded (${fileBuffer.length} bytes)`);
            await job.updateProgress(40);

            // 3. Determine Type
            const ext = path.extname(fileName).toLowerCase();
            let type = 'text'; // default
            let payloadData: any = base64Data; // Default: base64 string

            if (ext === '.pdf') {
                type = 'pdf';
            }
            else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                type = 'image';
            }
            // EXCEL / CSV -> Convert to JSON immediately
            else if (['.csv', '.xlsx', '.xls'].includes(ext)) {
                console.log(`[Worker] 📊 Parsing ${ext} using XLSX library...`);
                await job.log(`[Worker] 📊 Parsing ${ext} to JSON...`);

                try {
                    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
                    const firstSheet = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheet];

                    // Convert to Array of Objects (JSON)
                    // raw: false ensures we get formatted strings (dates etc) which is usually better for LLM
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: "" });

                    if (jsonData.length > 0) {
                        payloadData = jsonData;
                        type = 'json';
                        console.log(`[Worker] ✅ Parsed ${jsonData.length} records.`);
                    } else {
                        // Empty or failed parse? Fallback to text
                        console.warn("[Worker] ⚠️ XLSX produced 0 records. Treating as raw text.");
                        payloadData = fileBuffer.toString('utf-8');
                        type = 'text';
                    }

                } catch (err: any) {
                    console.error(`[Worker] ❌ XLSX Parse Failed: ${err.message}. Fallback to text.`);
                    payloadData = fileBuffer.toString('utf-8');
                    type = 'text';
                }
            }
            // OTHER TEXT
            else if (['.txt', '.json'].includes(ext)) {
                if (ext === '.json') {
                    try {
                        payloadData = JSON.parse(fileBuffer.toString('utf-8'));
                        type = 'json';
                    } catch (e) {
                        payloadData = fileBuffer.toString('utf-8');
                        type = 'text';
                    }
                } else {
                    payloadData = fileBuffer.toString('utf-8');
                    type = 'text'; // Raw text logic extractor
                }
            }

            const BucketModule = await import('../models/Bucket');
            // @ts-ignore
            const BucketModel = BucketModule.default || BucketModule.Bucket;

            // Fetch Bucket for parameters
            let bucketParams: any[] = [];
            const bucket = await BucketModel.findById(jobDoc.bucketId);
            if (bucket) {
                bucketParams = bucket.parameters || [];
                console.log(`[Worker] 🛠️ Using ${bucketParams.length} custom bucket parameters for extraction.`);
            }

            const result = await processDocumentWithOpenAI({
                data: payloadData,
                type: type,
                fileName: fileName,
                additionalPrompt: job.data.userPrompt, // Pass the user prompt from job data
                parameters: bucketParams
            });

            console.log(`[Worker] ✅ Processing complete. Result keys: ${Object.keys(result.data).join(', ')}`);
            await job.log(`[Worker] ✅ Processing complete.`);
            await job.updateProgress(80);

            // 5. Scalable Save with Token Logic
            console.log(`[Worker] 💾 Saving results with Token Check...`);
            await job.log(`[Worker] 💾 Saving results...`);

            const groupedData = result.data;
            let allRecords: any[] = [];

            if (result.allRecords && Array.isArray(result.allRecords)) {
                console.log(`[Worker] 🔄 Using preserved file order (${result.allRecords.length} records)`);
                allRecords = result.allRecords;
            } else if (Array.isArray(groupedData)) {
                console.log(`[Worker] 🔄 Result data is already a flat array (${groupedData.length} records)`);
                allRecords = groupedData;
            } else {
                console.log(`[Worker] ⚠️ Flattening grouped data...`);
                // Flatten grouped data (Legacy / Fallback)
                Object.keys(groupedData).forEach(groupKey => {
                    const records = groupedData[groupKey];
                    if (Array.isArray(records)) {
                        records.forEach(r => allRecords.push(r));
                    }
                });
            }

            console.log(`[Worker] 📊 Total Records Generated: ${allRecords.length}`);

            // Import Models - correct default import handling
            const RecordModule = await import('../models/Record');
            // @ts-ignore
            const RecordModel = RecordModule.default || RecordModule.Record;

            const UserModule = await import('../models/User');
            // @ts-ignore
            const UserModel = UserModule.default || UserModule.User;

            const MAX_BATCH_SIZE = 100;
            let savedCount = 0;
            const TOKEN_COST_PER_RECORD = 1; // Example Cost

            // Get Job Owner
            // const fullJob = await JobModel.findById(jobId); // Redundant, we have jobDoc
            const fullJob = jobDoc;
            if (!fullJob) throw new Error("Job not found during processing");

            // Get Bucket Owner
            // Get Bucket Owner
            let userId = null;
            const bId = String(fullJob.bucketId);

            if (bId === 'admin') {
                console.log('[Worker] 🛡️ Admin Job detected. Skipping token deduction.');
            } else {
                try {
                    // @ts-ignore
                    const bucket = await BucketModel.findById(fullJob.bucketId);
                    // @ts-ignore
                    userId = bucket?.createdBy || bucket?.owner;
                } catch (err: any) {
                    console.warn(`[Worker] ⚠️ Failed to lookup bucket '${fullJob.bucketId}': ${err.message}`);
                }
            }

            if (!userId && bId !== 'admin') {
                console.warn("Owner not found for bucket, proceeding without debit check (fallback)");
            }

            let isPaused = false;
            let currentTokensConsumed = 0;

            for (let i = 0; i < allRecords.length; i += MAX_BATCH_SIZE) {
                // 1. Check User Tokens (Refresh per batch)
                let user;
                if (userId) {
                    user = await UserModel.findById(userId);
                    if (!user) throw new Error("User not found");
                }

                const batch = allRecords.slice(i, i + MAX_BATCH_SIZE);
                const batchCost = batch.length * TOKEN_COST_PER_RECORD;

                if (user && user.tokens < batchCost) {
                    // PAUSE JOB
                    console.log(`[Worker] ⚠️ Insufficient tokens (${user.tokens} < ${batchCost}). Pausing Job.`);
                    await job.log(`[Worker] ⚠️ Insufficient tokens. Pausing job at ${savedCount} records.`);

                    isPaused = true;

                    // Update Job to Paused
                    await JobModel.findByIdAndUpdate(jobId, {
                        status: 'paused',
                        rowsProcessed: savedCount,
                        tokensConsumed: currentTokensConsumed + (fullJob.tokensConsumed || 0),
                        result: {
                            error: `Partial Success: Saved ${savedCount} records (${savedCount} credits processed). Paused due to insufficient balance for remaining items. Please add credits to resume.`,
                            summary: `Paused: ${savedCount} / ${allRecords.length} records saved.`,
                            partialData: true
                        },
                        metrics: result.performance, // Save metrics so far
                    });

                    // Store remaining records somewhere? Or just re-process?
                    // ideally we store the 'result' JSON in S3 or job result temporarily.
                    // For now, we save what we have and mark paused.
                    break;
                }

                // 2. Save Batch
                const recordDocs = batch.map(r => ({
                    jobId: jobId,
                    data: r
                }));
                await RecordModel.insertMany(recordDocs, { ordered: false });

                // 3. Deduct Tokens
                if (user) {
                    user.tokens -= batchCost;
                    await user.save();
                }

                currentTokensConsumed += batchCost;
                savedCount += batch.length;

                await job.updateProgress(80 + Math.floor((savedCount / allRecords.length) * 20));
            }

            if (!isPaused) {
                // Update Job with Result Summary
                await JobModel.findByIdAndUpdate(jobId, {
                    status: 'waiting_approval',
                    result: {
                        summary: 'Data stored in Records collection',
                        totalRecords: savedCount,
                        groups: Object.keys(groupedData),
                        detectedMapping: result.mapping || {} // Include semantic mapping info
                    },
                    metrics: result.performance,
                    tokensConsumed: currentTokensConsumed + (fullJob.tokensConsumed || 0),
                    rowsProcessed: savedCount,
                    updatedAt: new Date()
                });

                console.log(`[Worker] 🎉 Job ${jobId} completed. Saved: ${savedCount}`);
                await job.log(`[Worker] 🎉 Job completed. Records: ${savedCount}`);
                await job.updateProgress(100);
            }

            return { success: !isPaused, paused: isPaused };

        } catch (error: any) {
            console.error(`[Worker] ❌ Job ${jobId} FAILED:`, error.message);
            console.error(error.stack);
            await job.log(`[Worker] ❌ FAILED: ${error.message}`);
            await JobModel.findByIdAndUpdate(jobId, {
                status: 'failed',
                error: error.message,
                updatedAt: new Date()
            });
            throw error;
        }
    }, {
        connection: connection as any
    });

    worker.on('completed', (job) => {
        console.log(`[Worker] Job ${job.id} completed!`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed with ${err.message}`);
    });

    console.log(`[Worker] Worker for queue '${QUEUE_NAME}' started successfully.`);
    return worker;
};

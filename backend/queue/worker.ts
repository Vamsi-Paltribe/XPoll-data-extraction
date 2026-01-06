import { Worker, Job } from 'bullmq';
import connection from './connection';
import JobModel from '../models/Job';
import { processDocumentWithOpenAI } from '../services/openaiProcessor';
import axios from 'axios';
import path from 'path';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3 } from '../config/s3';

export const QUEUE_NAME = 'image-processing-queue';

export const setupWorker = () => {
    const worker = new Worker(QUEUE_NAME, async (job: Job) => {
        console.log(`[Worker] 🚀 STARTING Job ${job.id}`);
        const { jobId, url, fileName, key } = job.data;

        try {
            // 1. Update Job Status to Processing
            console.log(`[Worker] Updating status to 'processing' for job ${jobId}`);
            await JobModel.findByIdAndUpdate(jobId, { status: 'processing' });

            // 2. Download File (Using S3 SDK for private buckets)
            console.log(`[Worker] 📥 Downloading file from S3 (Key: ${key})...`);

            let fileBuffer: Buffer;

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
                const response = await axios.get(url, { responseType: 'arraybuffer' });
                fileBuffer = Buffer.from(response.data);
            }

            const base64Data = fileBuffer.toString('base64');
            console.log(`[Worker] ✅ File downloaded. Size: ${fileBuffer.length} bytes`);

            // 3. Determine Type
            const ext = path.extname(fileName).toLowerCase();
            let type = 'text'; // default
            if (ext === '.pdf') type = 'pdf';
            else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) type = 'image';
            else if (['.csv', '.xlsx', '.xls'].includes(ext)) {
                type = 'toon';
            }

            console.log(`[Worker] 🏷️  Detected file type: ${type} (Extension: ${ext})`);

            // 4. Process
            console.log(`[Worker] ⚙️  Sending to OpenAI Processor...`);
            let payloadData: any = base64Data;
            if (type === 'toon') {
                payloadData = fileBuffer.toString('utf-8'); // CSV/Text as string
            }

            const result = await processDocumentWithOpenAI({
                data: payloadData,
                type: type,
                fileName: fileName
            });
            console.log(`[Worker] ✅ Processing complete. Result keys: ${Object.keys(result.data).join(', ')}`);

            // 5. Update Job with Result
            console.log(`[Worker] 💾 Saving results to Database...`);
            await JobModel.findByIdAndUpdate(jobId, {
                status: 'waiting_approval',
                result: result.data,
                metrics: result.performance,
                updatedAt: new Date()
            });

            console.log(`[Worker] 🎉 Job ${jobId} completed successfully & saved.`);
            return { success: true };

        } catch (error: any) {
            console.error(`[Worker] ❌ Job ${jobId} FAILED:`, error.message);
            console.error(error.stack);
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

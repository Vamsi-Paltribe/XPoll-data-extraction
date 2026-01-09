import { Worker, Job } from 'bullmq';
import connection from './connection';
import { commitDataToRegistry } from '../services/commitService';
import { COMMIT_QUEUE_NAME } from './commitQueue';

export function setupCommitWorker() {
    console.log(`[CommitWorker] Initializing worker for queue: ${COMMIT_QUEUE_NAME}`);

    const worker = new Worker(COMMIT_QUEUE_NAME, async (job: Job) => {
        console.log(`[CommitWorker] 🚀 STARTING Commit Job ${job.id}`);
        await job.log(`[CommitWorker] Processing commit for User: ${job.data.userId}`);

        try {
            const { userId, extractedData, saveAsTemplate, templateName, logic, signature } = job.data;

            await job.updateProgress(10);

            // Call the existing service
            const result = await commitDataToRegistry({
                userId,
                extractedData,
                saveAsTemplate,
                templateName,
                logic,
                signature
            });

            await job.updateProgress(100);
            console.log(`[CommitWorker] ✅ Job ${job.id} Completed. Saved ${result.totalRecords} records.`);

            return result;

        } catch (error: any) {
            console.error(`[CommitWorker] ❌ Job ${job.id} FAILED:`, error.message);
            await job.log(`[CommitWorker] Error: ${error.message}`);
            throw error;
        }
    }, {
        connection: connection as any,
        concurrency: 2 // Allow 2 commits at once
    });

    worker.on('completed', (job) => {
        console.log(`[CommitWorker] Job ${job.id} completed!`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[CommitWorker] Job ${job?.id} failed with ${err.message}`);
    });

    return worker;
}

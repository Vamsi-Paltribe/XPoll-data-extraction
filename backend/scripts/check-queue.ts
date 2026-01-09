import { Queue } from 'bullmq';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const checkQueue = async () => {
    console.log('--- Queue Diagnostic Tool ---');
    console.log('Redis Host:', process.env.REDIS_HOST);

    const queue = new Queue('image-processing-queue', {
        connection: {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD
        }
    });

    try {
        const counts = await queue.getJobCounts('wait', 'active', 'failed', 'completed', 'delayed');
        console.log('Queue Status:', counts);

        // Check Failed Jobs
        if (counts.failed > 0) {
            const failed = await queue.getFailed(0, 1);
            if (failed.length > 0) {
                console.log('\n--- HEAD FAILED JOB ---');
                console.log('ID:', failed[0].id);
                console.log('Reason:', failed[0].failedReason);
                console.log('Stack:', failed[0].stacktrace);
                console.log('Data:', JSON.stringify(failed[0].data).substring(0, 200));
            }
        }

        // Check Completed Jobs (To see if output is null)
        if (counts.completed > 0) {
            const completed = await queue.getCompleted(0, 1); // Latest ones usually at the end or start depending on retrieval? usually getCompleted returns specific range. 
            // BullMQ getCompleted returns most recent? No, usually oldest to newest or via range. 
            // Let's get the *latest* completed.
            // Actually getCompleted(0, 1) might be oldest.
            // Safe bet: get 'completed' and grab the last one if array is growing.
            // Actually, let's just inspect the first one returned to see structure.
            if (completed.length > 0) {
                console.log('\n--- SAMPLE COMPLETED JOB ---');
                console.log('ID:', completed[0].id);
                console.log('Result:', JSON.stringify(completed[0].returnvalue).substring(0, 500));
            }
        }

        await queue.close();
        process.exit(0);
    } catch (err) {
        console.error('Failed to connect to queue:', err);
        process.exit(1);
    }
};

checkQueue();

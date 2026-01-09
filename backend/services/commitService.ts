import mongoose from 'mongoose';
import { Bucket } from '../models/Bucket';
import { CustomerRecord } from '../models/CustomerRecord';
import { ParsingTemplate } from '../models/ParsingTemplate';

import Job from '../models/Job';
import RecordModel from '../models/Record'; // Import Record Model

interface CommitOptions {
    userId: string;
    extractedData?: any; // Optional now
    jobId?: string;      // New field
    saveAsTemplate?: boolean;
    templateName?: string;
    logic?: any;
    signature?: string;
}

export const commitDataToRegistry = async (options: CommitOptions) => {
    const { userId, extractedData, jobId, saveAsTemplate, templateName, logic, signature } = options;

    let totalRecords = 0;
    const statesProcessed = new Set<string>();

    // CASE 1: SCALABLE MODE (Job ID Provided)
    if (jobId) {
        console.log(`[Commit Service] 🚀 Scalable Commit Mode for Job ${jobId}`);

        // We will process in batches to keep memory low
        const BATCH_SIZE = 2000;
        let cursor = RecordModel.find({ jobId }).cursor({ batchSize: BATCH_SIZE });

        let batch: any[] = [];

        // Helper to process a batch
        const processBatch = async (items: any[]) => {
            if (items.length === 0) return;

            // Group by State locally for this batch
            const byState: Record<string, any[]> = {};
            items.forEach(item => {
                const data = item.data;
                const state = data.State || 'Unknown';
                if (!byState[state]) byState[state] = [];
                byState[state].push(data);
            });

            // Insert per state
            for (const stateName of Object.keys(byState)) {
                statesProcessed.add(stateName);
                await insertRecordsForState(stateName, byState[stateName], userId);
            }
            totalRecords += items.length;
            console.log(`[Commit Service] Processed batch of ${items.length} records...`);
        };

        for await (const doc of cursor) {
            batch.push(doc);
            if (batch.length >= BATCH_SIZE) {
                await processBatch(batch);
                batch = []; // Clear
            }
        }

        // Process remaining
        if (batch.length > 0) {
            await processBatch(batch);
        }

    }
    // CASE 2: LEGACY/DIRECT MODE (extractedData payload)
    else if (extractedData) {
        console.log(`[Commit Service] standard Commit Mode (Payload based)`);
        const states = Object.keys(extractedData);
        for (const stateName of states) {
            const records = extractedData[stateName];
            if (!records?.length) continue;
            statesProcessed.add(stateName);
            await insertRecordsForState(stateName, records, userId);
            totalRecords += records.length;
        }
    }

    // Save Template if requested
    if (saveAsTemplate && templateName && logic && signature) {
        try {
            await ParsingTemplate.findOneAndUpdate(
                { signature },
                {
                    name: templateName,
                    logic: logic,
                    signature: signature,
                    createdBy: userId,
                    $inc: { usageCount: 1 }
                },
                { upsert: true, new: true }
            );
            console.log(`[Commit Service] Template saved: "${templateName}"`);
        } catch (templateErr: any) {
            console.error(`[CommitService] Failed to save template: ${templateErr.message}`);
        }
    }

    return {
        success: true,
        totalRecords,
        states: Array.from(statesProcessed).map(s => ({ name: s, count: 'N/A' })) // Simplified count for scalable mode
    };
};

/**
 * Helper: Inserts records into the correct Bucket
 */
async function insertRecordsForState(stateName: string, records: any[], userId: string) {
    // 1. Find or Create Bucket
    let bucket = await Bucket.findOne({ name: stateName, type: 'global' });
    if (!bucket) {
        console.log(`[Commit Service] Creating Bucket: ${stateName}`);
        bucket = new Bucket({
            name: stateName,
            description: `Master Registry - ${stateName}`,
            type: 'global',
            createdBy: mongoose.isValidObjectId(userId) ? userId : undefined, // Fix: CastError for "ADMIN_JOB_USER"
            sourceUrl: 'UPLOADED_VIA_ADMIN_DASHBOARD'
        });
        await bucket.save();
    }

    // 2. Prepare Docs
    const customerRecords = records.map((record: any) => ({
        bucketId: bucket!._id,
        data: record,
        keyHash: record.keyHash || Math.random().toString(36).substring(7),
        history: [{ action: 'imported', details: `Imported via Admin Upload` }]
    }));

    // 3. Bulk Insert
    try {
        await CustomerRecord.insertMany(customerRecords, { ordered: false });
    } catch (err: any) {
        // Ignore duplicate errors
    }

    // 4. Update Metadata
    const existingHeaders = new Set(bucket!.availableHeaders || []);
    const existingCities = new Set(bucket!.availableCities || []);

    records.forEach((rec: any) => {
        Object.keys(rec).forEach(k => {
            if (!k.startsWith('_') && k !== 'bucketId') existingHeaders.add(k);
        });
        if (rec.City) existingCities.add(rec.City);
    });

    bucket!.availableHeaders = Array.from(existingHeaders).sort();
    bucket!.availableCities = Array.from(existingCities).sort();
    bucket!.lastSyncedAt = new Date();
    await bucket!.save();
}

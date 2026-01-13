import mongoose from 'mongoose';
import { Bucket } from '../models/Bucket';
import { CustomerRecord } from '../models/CustomerRecord';
import { ParsingTemplate } from '../models/ParsingTemplate';

import Job from '../models/Job';
import RecordModel from '../models/Record'; // Import Record Model
import { StagingRecord } from '../models/StagingRecord';

interface CommitOptions {
    userId: string;
    extractedData?: any; // Optional now
    jobId?: string;      // New field
    targetBucketId?: string; // NEW: The specific bucket to commit to
    saveAsTemplate?: boolean;
    templateName?: string;
    logic?: any;
    signature?: string;
    defaultState?: string; // Manual override from UI
    isSyncJob?: boolean;   // Flag for sync-based jobs
}

export const commitDataToRegistry = async (options: CommitOptions) => {
    const { userId, extractedData, jobId, targetBucketId, saveAsTemplate, templateName, logic, signature, defaultState } = options;

    let totalRecords = 0;
    const statesProcessed = new Set<string>();

    console.log(`[Commit Service] Commit initialized. Target Bucket: ${targetBucketId || 'Global Registry'}`);

    // CASE 1: SCALABLE MODE (Job ID Provided)
    if (jobId) {
        console.log(`[Commit Service] 🚀 Scalable Commit Mode for Job ${jobId}. Target: ${targetBucketId || 'Global'}`);

        const job = await Job.findById(jobId);
        if (!job) throw new Error("Job not found");

        const isSync = options.isSyncJob || job.mimeType === 'application/x-sync';
        const DataModel: any = isSync ? StagingRecord : RecordModel;
        const query: any = isSync ? { batchId: job.result?.batchId } : { jobId };

        // We will process in batches to keep memory low
        const BATCH_SIZE = 2000;
        const totalJobRecords = await DataModel.countDocuments(query);
        console.log(`[Commit Service] Found ${totalJobRecords} records in ${isSync ? 'StagingRecord' : 'RecordModel'} for Job ${jobId}`);

        let cursor = DataModel.find(query).cursor({ batchSize: BATCH_SIZE });

        let batch: any[] = [];

        // Helper to process a batch
        const processBatch = async (items: any[]) => {
            if (items.length === 0) return;

            // Case A: Targeted Commit (Private Bucket)
            if (targetBucketId && targetBucketId !== 'admin') {
                await insertRecordsToTargetBucket(targetBucketId, items, userId, defaultState);
            }
            // Case B: Global Commit (State-based)
            else {
                // Group by State locally for this batch
                const byState: Record<string, any[]> = {};
                items.forEach(item => {
                    const data = item.data;
                    // Apply default state if missing
                    if (!data.State && defaultState) {
                        data.State = defaultState;
                    }
                    const state = data.State || 'Unknown';
                    if (!byState[state]) byState[state] = [];
                    byState[state].push(data);
                });

                // Insert per state
                for (const stateName of Object.keys(byState)) {
                    statesProcessed.add(stateName);
                    await insertRecordsForState(stateName, byState[stateName], userId);
                }
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

        if (targetBucketId && targetBucketId !== 'admin') {
            // Fallback: If extractedData is grouped by state e.g. { 'NY': [...] }
            // Flatten it first
            let flatRecords: any[] = [];
            if (typeof extractedData === 'object' && !Array.isArray(extractedData)) {
                Object.values(extractedData).forEach((v: any) => {
                    if (Array.isArray(v)) flatRecords.push(...v);
                });
            } else if (Array.isArray(extractedData)) {
                flatRecords = extractedData;
            }
            await insertRecordsToTargetBucket(targetBucketId, flatRecords, userId, defaultState);
            totalRecords = flatRecords.length;
        } else {
            const states = Object.keys(extractedData);
            for (const stateName of states) {
                const records = extractedData[stateName];
                if (!records?.length) continue;
                statesProcessed.add(stateName);
                await insertRecordsForState(stateName, records, userId);
                totalRecords += records.length;
            }
        }
    }

    // Save Template if requested (Logic omitted for brevity, assumed unchanged)
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
        states: Array.from(statesProcessed).map(s => ({ name: s, count: 'N/A' }))
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
            createdBy: mongoose.isValidObjectId(userId) ? userId : undefined,
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
    const existingStates = new Set(bucket!.availableStates || []); // Added

    records.forEach((rec: any) => {
        Object.keys(rec).forEach(k => {
            if (!k.startsWith('_') && k !== 'bucketId') existingHeaders.add(k);
        });
        if (rec.City) existingCities.add(rec.City);
        // Note: Global buckets are usually BY state, so availableStates might just be [stateName]
        existingStates.add(stateName);
    });

    bucket!.availableHeaders = Array.from(existingHeaders).sort();
    bucket!.availableCities = Array.from(existingCities).sort();
    bucket!.availableStates = Array.from(existingStates).sort(); // Added
    bucket!.lastSyncedAt = new Date();
    await bucket!.save();
}

/**
 * Helper: Inserts records into a SPECIFIC target bucket (Private Mode)
 */
async function insertRecordsToTargetBucket(bucketId: string, records: any[], userId: string, defaultState?: string) {
    // 1. Find Bucket
    if (bucketId === 'admin') {
        console.log(`[Commit Service] 🛡️ Skipping specific bucket lookup for 'admin'. Using Global Registry logic.`);
        return;
    }
    const bucket = await Bucket.findById(bucketId);
    if (!bucket) {
        console.error(`[Commit Service] ❌ Target Bucket NOT FOUND: ${bucketId}`);
        return;
    }

    // 2. Prepare Docs
    const customerRecords = records.map((record: any) => {
        const rowData = record.data || record;
        // Inject Default State if missing
        if (!rowData.State && defaultState) {
            rowData.State = defaultState;
        }

        return {
            bucketId: bucket._id,
            data: rowData,
            keyHash: rowData.keyHash || Math.random().toString(36).substring(7),
            history: [{ action: 'imported', details: `Imported via approved extraction job` }]
        };
    });

    // 3. Bulk Insert
    try {
        await CustomerRecord.insertMany(customerRecords, { ordered: false });
    } catch (err: any) {
        console.warn(`[Commit Service] ⚠️ Batch upload to bucket ${bucketId} had some duplicates/errors: ${err.message}`);
    }

    // 4. Update Metadata
    const existingHeaders = new Set(bucket.availableHeaders || []);
    const existingCities = new Set(bucket.availableCities || []);
    const existingStates = new Set(bucket.availableStates || []);

    records.forEach((rec: any) => {
        const rowData = rec.data || rec;
        Object.keys(rowData).forEach(k => {
            if (!k.startsWith('_') && k !== 'bucketId') existingHeaders.add(k);
        });
        if (rowData.City) existingCities.add(rowData.City);
        if (rowData.State) existingStates.add(rowData.State);
    });

    bucket.availableHeaders = Array.from(existingHeaders).sort();
    bucket.availableCities = Array.from(existingCities).sort();
    bucket.availableStates = Array.from(existingStates).sort();
    bucket.lastSyncedAt = new Date();
    await bucket.save();
    console.log(`[Commit Service] ✅ Successfully committed ${records.length} records to bucket "${bucket.name}"`);
}

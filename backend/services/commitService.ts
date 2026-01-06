import { Bucket } from '../models/Bucket';
import { CustomerRecord } from '../models/CustomerRecord';
import { ParsingTemplate } from '../models/ParsingTemplate';

interface CommitOptions {
    userId: string;
    extractedData: any;
    saveAsTemplate?: boolean;
    templateName?: string;
    logic?: any;
    signature?: string;
}

export const commitDataToRegistry = async (options: CommitOptions) => {
    const { userId, extractedData, saveAsTemplate, templateName, logic, signature } = options;

    const states = Object.keys(extractedData);
    let totalRecords = 0;

    for (const stateName of states) {
        const records = extractedData[stateName];
        if (!records || records.length === 0) continue;

        console.log(`[Commit Service] Processing ${records.length} records for ${stateName}`);

        // 1. Find or Create Global Bucket for this State
        let bucket = await Bucket.findOne({ name: stateName, type: 'global' });

        if (!bucket) {
            console.log(`[Commit Service] Creating new Global Bucket for ${stateName}`);
            bucket = new Bucket({
                name: stateName,
                description: `Master Data Registry for ${stateName}`,
                type: 'global',
                createdBy: userId,
                sourceUrl: 'UPLOADED_VIA_ADMIN_DASHBOARD'
            });
            await bucket.save();
        }

        // 2. Prepare Records for Bulk Insert
        const customerRecords = records.map((record: any) => ({
            bucketId: bucket!._id,
            data: record, // Store the flexible data here
            keyHash: record.keyHash || Math.random().toString(36).substring(7), // Fallback
            history: [{
                action: 'imported',
                details: `Imported via Admin Upload by ${userId}`
            }]
        }));

        // 3. Bulk Insert
        let insertedCount = 0;
        try {
            // @ts-ignore
            const result = await CustomerRecord.insertMany(customerRecords, { ordered: false });
            insertedCount = result.length;
        } catch (err: any) {
            if (err.writeErrors) {
                insertedCount = err.insertedDocs.length;
                console.log(`[Commit Service] Inserted ${insertedCount} records. (${err.writeErrors.length} duplicates skipped)`);
            } else {
                throw err;
            }
        }

        // 4. Update METADATA (Headers & Cities)
        const existingHeaders = new Set(bucket!.availableHeaders || []);
        const existingCities = new Set(bucket!.availableCities || []);

        records.forEach((rec: any) => {
            // Headers
            Object.keys(rec).forEach(k => {
                if (!k.startsWith('_') && k !== 'bucketId' && k !== 'keyHash') {
                    existingHeaders.add(k);
                }
            });
            // Cities
            const city = rec.City || rec.CITY || rec.city;
            if (city && typeof city === 'string') {
                existingCities.add(city.trim());
            }
        });

        bucket!.availableHeaders = Array.from(existingHeaders).sort();
        bucket!.availableCities = Array.from(existingCities).sort();
        bucket!.lastSyncedAt = new Date();

        await bucket!.save();
        totalRecords += insertedCount;
    }

    // Save Template if requested
    if (saveAsTemplate && templateName && logic && signature) {
        try {
            // Upsert to avoid race conditions
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
            console.error(`[Commit Service] Failed to save template: ${templateErr.message}`);
        }
    }

    return {
        success: true,
        totalRecords,
        states: states.map(s => ({ name: s, recordCount: extractedData[s].length }))
    };
};

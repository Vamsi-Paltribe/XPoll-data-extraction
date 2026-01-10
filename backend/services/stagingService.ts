import { CustomerRecord } from '../models/CustomerRecord';
import { StagingRecord } from '../models/StagingRecord';
import { SyncBatch } from '../models/SyncBatch';
import { Bucket, IBucket } from '../models/Bucket';
import { Types } from 'mongoose';

const stateMap: Record<string, string> = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
    'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
    'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
};

interface FetchFilters {
    states?: string[];
    cities?: string[];
    limitRows?: number;
    selectedHeaders?: string[];
    [key: string]: any;
}

/**
 * Fetch records from Global Buckets (Database) based on filters
 * Replaces old Google Sheet fetching
 */
export const fetchGlobalRecords = async (filters: FetchFilters = {}) => {
    try {
        let globalBuckets: any[] = [];

        // 1. Find relevant Global Buckets
        if (filters.states && filters.states.length > 0) {
            // Map codes to names if needed, or search both
            const stateNames = filters.states.flatMap(code => {
                const name = stateMap[code.toUpperCase()];
                return name ? [code, name] : [code];
            });

            // Case-insensitive regex match for bucket names
            const regexQueries = stateNames.map(s => new RegExp(s, 'i'));
            globalBuckets = await Bucket.find({
                type: 'global',
                name: { $in: regexQueries }
            });
        } else {
            // If no state filter, fetch ALL global buckets (careful with size!)
            // For safety, maybe default to none or limit? 
            // Let's fetch all but warn usage.
            globalBuckets = await Bucket.find({ type: 'global' });
        }

        if (globalBuckets.length === 0) {
            console.log('[FetchGlobal] No matching Global Buckets found for filters:', filters);
            return [];
        }

        const bucketIds = globalBuckets.map(b => b._id);
        console.log(`[FetchGlobal] Found ${bucketIds.length} buckets. Fetching records...`);

        // 2. Fetch Records
        let query = { bucketId: { $in: bucketIds } };

        // Optional limit for preview/headers
        const limit = filters.limitRows || 0;

        const records = await CustomerRecord.find(query)
            .limit(limit)
            .lean(); // Faster

        // 3. Map to flattened structure for compatibility
        return records.map(r => {
            const flat: any = { ...r.data };
            flat._id = r._id; // Keep handy
            // @ts-ignore
            flat._bucketName = globalBuckets.find(b => b._id.equals(r.bucketId as Types.ObjectId))?.name;
            return flat;
        });

    } catch (error: any) {
        console.error("Error fetching global records:", error.message);
        throw error;
    }
};

export const fetchHeaders = async (filters: FetchFilters = {}) => {
    try {
        let globalBuckets: IBucket[] = [];

        // 1. Find relevant Global Buckets
        if (filters.states && filters.states.length > 0) {
            const stateNames = filters.states.flatMap(code => {
                const name = stateMap[code.toUpperCase()];
                return name ? [code, name] : [code];
            });
            const regexQueries = stateNames.map(s => new RegExp(s, 'i'));
            // @ts-ignore
            globalBuckets = await Bucket.find({
                type: 'global',
                // @ts-ignore
                name: { $in: regexQueries }
            }).select('availableHeaders');
        } else {
            // @ts-ignore
            globalBuckets = await Bucket.find({ type: 'global' }).select('availableHeaders');
        }

        if (globalBuckets.length === 0) return [];

        // 2. Aggregate Headers from Metadata
        const keys = new Set<string>();
        globalBuckets.forEach(b => {
            if (b.availableHeaders && Array.isArray(b.availableHeaders)) {
                b.availableHeaders.forEach(h => keys.add(h));
            }
        });

        return Array.from(keys).sort();

    } catch (error) {
        console.error("Error fetching headers from metadata:", error);
        return [];
    }
};

export const syncToStaging = async (bucketId: string, filters: FetchFilters) => {
    // 1. Cleanup old pending batches/records
    const pendingBatches = await SyncBatch.find({ bucketId, status: 'pending' });
    const pendingBatchIds = pendingBatches.map(b => b._id);
    await StagingRecord.deleteMany({ batchId: { $in: pendingBatchIds } });
    await SyncBatch.deleteMany({ _id: { $in: pendingBatchIds } });

    // 2. Create New Batch
    const newBatch = new SyncBatch({
        bucketId,
        filters,
        status: 'pending'
    });
    await newBatch.save();

    // 3. Fetch Data from Global Buckets (New Logic)
    console.log('[Sync] Fetching data from Global Buckets...');
    let sourceRecords = await fetchGlobalRecords(filters);
    console.log(`[Sync] Fetched ${sourceRecords.length} records.`);

    // 3.5 Client-side Filtering (Cities, etc) if not handled by DB query
    // Since our DB schema is flexible (Mixed), we can't easily query distinct fields efficiently 
    // without precise indexing. So we filter in code as before.
    if (filters && filters.cities?.length) {
        sourceRecords = sourceRecords.filter(rec => {
            return filters.cities!.some(c => {
                const cityKeyword = c.toLowerCase().trim();
                const cityVal = (rec.City || rec.CITY || rec.city || rec.Town || '').toLowerCase();
                return cityVal.includes(cityKeyword);
            });
        });
        console.log(`[Sync] Filtered by city to ${sourceRecords.length} records.`);
    }

    // 4. Prepare Staging Records
    const batchData: any[] = [];
    const customerRecordsMap = new Map();
    const existing = await CustomerRecord.find({ bucketId });
    existing.forEach(r => customerRecordsMap.set(r.keyHash, r.data));

    const bucket = await Bucket.findById(bucketId);
    const bucketParams = bucket?.parameters?.map(p => p.name) || [];

    let conflictCount = 0;

    for (const rec of sourceRecords) {
        // Robust extraction for KeyHash (Mandatory for conflict detection)
        const state = (rec.State || rec.STATE || rec.state || '').toLowerCase().trim();
        const city = (rec.City || rec.CITY || rec.city || '').toLowerCase().trim();
        const name = (rec.Name || rec.NAME || rec.name || '').toLowerCase().trim();

        const keyHash = `${state}|${city}|${name}`;

        // --- TOKEN TRIMMING LOGIC ---
        let dataToSave = rec;

        // --- PARAMETER FILTERING LOGIC ---
        // If user defined specific parameters in the bucket, we ONLY sync those.

        // Use user selected headers if present, otherwise fallback to bucket parameters
        const effectiveHeaders = (filters && filters.selectedHeaders && filters.selectedHeaders.length > 0)
            ? filters.selectedHeaders
            : bucketParams;

        if (effectiveHeaders.length > 0) {
            dataToSave = {};
            effectiveHeaders.forEach(header => {
                if (rec[header] !== undefined) {
                    dataToSave[header] = rec[header];
                }
            });
        }

        let status = 'pending';
        let conflictData = null;

        if (customerRecordsMap.has(keyHash)) {
            const existingData = customerRecordsMap.get(keyHash);

            // Basic comparison
            const recStr = JSON.stringify(dataToSave);
            const exStr = JSON.stringify(existingData);

            if (recStr !== exStr) {
                status = 'conflict';
                conflictCount++;
                conflictData = existingData;
            } else {
                continue; // Skip exact matches
            }
        }

        batchData.push({
            bucketId,
            batchId: newBatch._id,
            data: dataToSave,
            keyHash,
            status,
            conflictData
        });
    }

    // 5. Insert
    if (batchData.length > 0) {
        await StagingRecord.insertMany(batchData);
    }

    // 6. Update Batch Stats
    newBatch.recordCount = batchData.length;
    newBatch.conflictCount = conflictCount;
    await newBatch.save();

    return { batchId: newBatch._id, count: batchData.length, conflicts: conflictCount };
};

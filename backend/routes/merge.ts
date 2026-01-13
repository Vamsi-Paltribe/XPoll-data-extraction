import express, { Request, Response } from 'express';
import { Bucket } from '../models/Bucket';
import { CustomerRecord } from '../models/CustomerRecord';
import auth from '../middleware/auth';
import mongoose from 'mongoose';

import crypto from 'crypto';

const router = express.Router();

// @ts-ignore
router.use(auth);

/**
 * Helper: Generate a deterministic hash for a record's data
 */
const generateRecordHash = (data: any) => {
    // Sort keys to ensure stable string representation
    const sortedData = Object.keys(data).sort().reduce((acc: any, key) => {
        acc[key] = data[key];
        return acc;
    }, {});
    return crypto.createHash('md5').update(JSON.stringify(sortedData)).digest('hex');
};

/**
 * Helper: Deep compare two objects' data fields
 */
const areRecordsIdentical = (data1: any, data2: any) => {
    const keys1 = Object.keys(data1);
    const keys2 = Object.keys(data2);
    if (keys1.length !== keys2.length) return false;
    return keys1.every(key => data1[key] === data2[key]);
};

/**
 * POST /api/merge/analyze
 * Analyzes two buckets for identical and conflicting records
 */
// @ts-ignore
router.post('/analyze', async (req: any, res: Response) => {
    try {
        const { sourceId, targetId } = req.body;
        const bucketA = await Bucket.findById(sourceId);
        const bucketB = await Bucket.findById(targetId);

        if (!bucketA || !bucketB) return res.status(404).json({ error: "One or both buckets not found" });

        const recordsA = await CustomerRecord.find({ bucketId: sourceId }).lean();
        const recordsB = await CustomerRecord.find({ bucketId: targetId }).lean();

        let identical = 0;
        let conflicts = 0;
        let uniqueA = 0;
        let uniqueB = 0;

        // Simple heuristic: Use all keys for comparison
        // In a real app, we might let the user pick a 'primary key'
        const recordsBUniqueStrings = recordsB.map(r => JSON.stringify(r.data));
        const recordsBSet = new Set(recordsBUniqueStrings);

        recordsA.forEach(recA => {
            const strA = JSON.stringify(recA.data);
            if (recordsBSet.has(strA)) {
                identical++;
            } else {
                // Check for potential conflicts (same Name, different something else)
                const potentialConflict = recordsB.find(recB =>
                    (recB.data.Name === recA.data.Name || recB.data.name === recA.data.name) &&
                    recB.data.Name !== undefined
                );
                if (potentialConflict) {
                    conflicts++;
                } else {
                    uniqueA++;
                }
            }
        });

        uniqueB = recordsB.length - identical - conflicts;

        res.json({
            identical,
            conflicts,
            uniqueA,
            uniqueB,
            totalPotential: identical + conflicts + uniqueA + uniqueB
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/merge/execute
 * Executes the merge logic
 */
// @ts-ignore
router.post('/execute', async (req: any, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { sourceId, targetId, mergeName, conflictResolution } = req.body;

        const bucketA = await Bucket.findById(sourceId).session(session);
        const bucketB = await Bucket.findById(targetId).session(session);

        if (!bucketA || !bucketB) throw new Error("Buckets not found");

        // 1. Create the new Merged Bucket
        const mergedBucket = new Bucket({
            name: mergeName || `Merged: ${bucketA.name} & ${bucketB.name}`,
            createdBy: req.user.id,
            isMerged: true,
            parentLineage: {
                parents: [bucketA._id, bucketB._id],
                mergedAt: new Date()
            },
            parameters: bucketA.parameters, // Default to A's parameters
            availableHeaders: Array.from(new Set([...bucketA.availableHeaders, ...bucketB.availableHeaders]))
        });

        await mergedBucket.save({ session });

        // 2. Process and Clone Records
        const recordsA = await CustomerRecord.find({ bucketId: sourceId }).session(session);
        const recordsB = await CustomerRecord.find({ bucketId: targetId }).session(session);

        const newRecords = [];

        // Add all from A
        for (const recA of recordsA) {
            newRecords.push({
                bucketId: mergedBucket._id,
                data: recA.data,
                keyHash: recA.keyHash || generateRecordHash(recA.data),
                isMergeResult: true,
                lineage: [{ bucketId: sourceId, recordId: recA._id, mergedAt: new Date() }]
            });
        }

        // Add from B with conflict check
        for (const recB of recordsB) {
            const existing = newRecords.find(nr => areRecordsIdentical(nr.data, recB.data));
            if (existing) {
                // It's identical, just add to lineage
                existing.lineage.push({ bucketId: targetId, recordId: recB._id, mergedAt: new Date() });
            } else {
                // Not identical, check for "Name" conflict if resolution is 'fuse'
                // For simplicity in this mock, we append if not identical
                newRecords.push({
                    bucketId: mergedBucket._id,
                    data: recB.data,
                    keyHash: recB.keyHash || generateRecordHash(recB.data),
                    isMergeResult: true,
                    lineage: [{ bucketId: targetId, recordId: recB._id, mergedAt: new Date() }]
                });
            }
        }

        await CustomerRecord.insertMany(newRecords, { session });

        // 3. Hide Parents
        bucketA.hiddenByMerge = true;
        bucketB.hiddenByMerge = true;
        await bucketA.save({ session });
        await bucketB.save({ session });

        await session.commitTransaction();
        res.json({ success: true, bucketId: mergedBucket._id });
    } catch (err: any) {
        await session.abortTransaction();
        res.status(500).json({ error: err.message });
    } finally {
        session.endSession();
    }
});

/**
 * POST /api/merge/unmerge/:id
 * Reverts a merge
 */
// @ts-ignore
router.post('/unmerge/:id', async (req: any, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;
        const { newDataAction } = req.body;

        const mergedBucket = await Bucket.findById(id).session(session);
        if (!mergedBucket || !mergedBucket.isMerged) throw new Error("Merged bucket not found");

        const parents = mergedBucket.parentLineage.parents;
        let isolateBucketId = null;

        // 1. Process Records
        const records = await CustomerRecord.find({ bucketId: id }).session(session);

        // If isolate, create new bucket first
        if (newDataAction === 'isolate' && records.some(r => !r.lineage || r.lineage.length === 0)) {
            const newBucket = new Bucket({
                name: `${mergedBucket.name} (Isolated Post-Merge)`,
                description: `Records added to ${mergedBucket.name} after merge (Unmerged at ${new Date().toLocaleString()})`,
                createdBy: mergedBucket.createdBy,
                parameters: mergedBucket.parameters,
                availableHeaders: mergedBucket.availableHeaders
            });
            await newBucket.save({ session });
            isolateBucketId = newBucket._id;
        }

        for (const rec of records) {
            if (rec.lineage && rec.lineage.length > 0) {
                // This record came from parents, skip (it's already in parents as they were just hidden)
            } else {
                // This is NEW data added after merge
                if (newDataAction === 'duplicate') {
                    for (const pId of parents) {
                        const copy = new CustomerRecord({
                            bucketId: pId,
                            data: rec.data,
                            keyHash: rec.keyHash || generateRecordHash(rec.data),
                            history: [{ action: 'unmerge_added', timestamp: new Date(), details: `From merged bucket ${mergedBucket.name} (Duplicate)` }]
                        });
                        await copy.save({ session });
                    }
                } else if (newDataAction === 'keep_in_a') {
                    const copy = new CustomerRecord({
                        bucketId: parents[0],
                        data: rec.data,
                        keyHash: rec.keyHash || generateRecordHash(rec.data),
                        history: [{ action: 'unmerge_added', timestamp: new Date(), details: `From merged bucket ${mergedBucket.name} (Primary Parent)` }]
                    });
                    await copy.save({ session });
                } else if (newDataAction === 'keep_in_b' && parents.length > 1) {
                    const copy = new CustomerRecord({
                        bucketId: parents[1],
                        data: rec.data,
                        keyHash: rec.keyHash || generateRecordHash(rec.data),
                        history: [{ action: 'unmerge_added', timestamp: new Date(), details: `From merged bucket ${mergedBucket.name} (Secondary Parent)` }]
                    });
                    await copy.save({ session });
                } else if (newDataAction === 'isolate' && isolateBucketId) {
                    const copy = new CustomerRecord({
                        bucketId: isolateBucketId,
                        data: rec.data,
                        keyHash: rec.keyHash || generateRecordHash(rec.data),
                        history: [{ action: 'unmerge_added', timestamp: new Date(), details: `Isolated from unmerged ${mergedBucket.name}` }]
                    });
                    await copy.save({ session });
                }
            }
        }

        // 2. Unhide Parents
        await Bucket.updateMany({ _id: { $in: parents } }, { hiddenByMerge: false }).session(session);

        // 3. Delete Merged Bucket and its records
        await CustomerRecord.deleteMany({ bucketId: id }).session(session);
        await Bucket.findByIdAndDelete(id).session(session);

        await session.commitTransaction();
        res.json({ success: true });
    } catch (err: any) {
        await session.abortTransaction();
        res.status(500).json({ error: err.message });
    } finally {
        session.endSession();
    }
});

export default router;

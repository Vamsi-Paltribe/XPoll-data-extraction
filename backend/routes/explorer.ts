import express, { Request, Response } from 'express';
import OpenAI from 'openai';
import { CustomerRecord } from '../models/CustomerRecord';

const router = express.Router();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Allowed MongoDB Aggregation Stages (Strict Read-Only)
const ALLOWED_STAGES = new Set([
    '$match', '$project', '$group', '$sort', '$limit', '$skip', '$count', '$unwind', '$addFields', '$sample'
]);

/**
 * Validates that an aggregation pipeline is safe.
 * 1. Must be an array.
 * 2. Each stage must only use keys from ALLOWED_STAGES.
 * 3. No stages can be empty or null.
 */
function validatePipeline(pipeline: any[]): boolean {
    if (!Array.isArray(pipeline)) return false;

    for (const stage of pipeline) {
        const keys = Object.keys(stage);
        if (keys.length === 0) return false;

        // Check every operator in the stage root
        for (const key of keys) {
            if (!key.startsWith('$')) continue; // Field referencing is fine
            if (!ALLOWED_STAGES.has(key)) {
                console.warn(`[Explorer Security] Blocked Restricted Stage: ${key}`);
                return false;
            }
        }
    }
    return true;
}

/**
 * POST /api/explorer/query
 * Translates natural language to MongoDB Query and executes it.
 */
router.post('/query', async (req: Request, res: Response) => {
    try {
        const { query } = req.body;
        if (!query) {
            res.status(400).json({ error: 'Query text is required' });
            return;
        }

        console.log(`[Explorer] Processing Query: "${query}"`);

        // 1. AI Translation
        const systemPrompt = `
You are a MongoDB Expert. Convert the user's natural language request into a strict MongoDB Aggregation Pipeline for a collection called 'CustomerRecord'.

Schema Context:
- The actual business data is stored loosely in a 'data' field. 
- Example Document: { "_id": "...", "data": { "Name": "John", "City": "Austin", "State": "Texas", "Industry": "IT" }, "bucketId": "..." }
- When filtering or grouping, you MUST refer to fields as 'data.Field'. Example: 'data.State'.
- Do NOT perform operations on 'bucketId' or 'history' unless explicitly asked.

Rules:
1. Return ONLY the raw JSON array of the pipeline. No Markdown, no explanations.
2. Use ONLY these stages: $match, $project, $group, $sort, $limit, $skip, $count.
3. If the user asks for "samples" or "examples", use $limit: 10.
4. If no limit is specified, ALWAYS add { $limit: 50 } at the end to prevent overflow.
        `;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ],
            temperature: 0,
        });

        const rawContent = completion.choices[0].message.content?.trim();
        if (!rawContent) {
            throw new Error('AI returned empty response');
        }

        // Clean potential markdown code blocks
        const jsonString = rawContent.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '');

        let pipeline;
        try {
            pipeline = JSON.parse(jsonString);
        } catch (e) {
            console.error('[Explorer] AI returned invalid JSON:', jsonString);
            res.status(500).json({ error: 'Failed to generate a valid query structure.' });
            return;
        }

        // 2. Security Validation
        if (!validatePipeline(pipeline)) {
            res.status(400).json({ error: 'Generated query contained restricted operations. Request denied for safety.' });
            return;
        }

        console.log('[Explorer] Executing Pipeline:', JSON.stringify(pipeline));

        // 3. Execution (with timeout safety)
        // @ts-ignore
        const results = await CustomerRecord.aggregate(pipeline).maxTimeMS(5000); // 5s timeout

        res.json({
            success: true,
            pipeline: pipeline, // Return generated query for transparency
            results: results
        });

    } catch (error: any) {
        console.error('[Explorer] Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

export default router;

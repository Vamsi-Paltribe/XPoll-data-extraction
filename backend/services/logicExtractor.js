const OpenAI = require('openai');
const { analyzeJSONStructure, applyJSONMapping } = require('../utils/jsonAnalyzer');
const { deduplicateWithLogging } = require('../utils/deduplicator');
const PerformanceTracker = require('../utils/performanceTracker');

/**
 * Extract mapping logic from sample data
 * Returns logic that can be applied to full dataset without LLM
 * 
 * @param {Array} sampleData - Sample rows (50-100)
 * @param {String} fileType - Type of file (json, text, etc)
 * @param {String} fileName - Original filename
 * @returns {Object} - { logic, confidence, needsLLM, tokenUsage }
 */
async function extractMappingLogic(sampleData, fileType, fileName = 'unknown') {
    const tracker = new PerformanceTracker(fileName, 'logic-extraction');

    try {
        console.log(`[Logic Extractor] Processing ${sampleData.length} sample rows`);

        // Step 1: Deduplicate sample
        tracker.startStep('Deduplicate Sample');
        const dedupResult = deduplicateWithLogging(sampleData, fileName);
        const uniqueSample = dedupResult.unique;
        tracker.endStep({
            originalCount: dedupResult.stats.total,
            uniqueCount: dedupResult.stats.unique,
            duplicatesRemoved: dedupResult.stats.duplicates
        });

        // Step 2: Analyze structure locally
        tracker.startStep('Analyze Structure Locally');
        const analysis = analyzeJSONStructure(uniqueSample, uniqueSample.length);
        tracker.endStep({
            confidence: analysis.confidence,
            needsLLM: analysis.needsLLM,
            matchedFields: analysis.mapping ? Object.keys(analysis.mapping).length : 0
        });

        console.log(`[Logic Extractor] Local analysis confidence: ${Math.round(analysis.confidence * 100)}%`);

        // CASE 1: High confidence - No LLM needed!
        if (!analysis.needsLLM) {
            console.log(`[Logic Extractor] ✅ High confidence (${Math.round(analysis.confidence * 100)}%) - No LLM needed!`);

            const performance = tracker.logReport();

            return {
                success: true,
                logic: {
                    type: 'field_mapping',
                    mapping: analysis.mapping,
                    confidence: analysis.confidence
                },
                confidence: analysis.confidence,
                needsLLM: false,
                tokenUsage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                },
                performance,
                tier: 1,
                message: `Pattern detected locally with ${Math.round(analysis.confidence * 100)}% confidence. No LLM needed.`
            };
        }

        // CASE 2: Medium confidence - Use LLM on sample only
        if (analysis.useSmartLLM) {
            console.log(`[Logic Extractor] ⚡ Medium confidence - Using LLM on ${uniqueSample.length} sample rows...`);

            tracker.startStep('LLM Logic Extraction');

            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            // Check if data is concatenated in one field
            const firstRecord = uniqueSample[0];
            const sourceFields = Object.keys(firstRecord);
            const nonEmptyFields = sourceFields.filter(f => firstRecord[f] && firstRecord[f].trim());
            const isConcatenated = nonEmptyFields.length === 1;

            let prompt;
            if (isConcatenated) {
                const dataField = nonEmptyFields[0];
                console.log(`[Logic Extractor] ⚠️ Data is concatenated in field: "${dataField}"`);

                prompt = `Analyze this sample data and create a parsing function.

TARGET SCHEMA: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer

SAMPLE DATA (${uniqueSample.length} rows):
${uniqueSample.slice(0, 10).map(r => r[dataField]).join('\n')}

Return a JavaScript function that can parse each concatenated string:
{
  "type": "parsing_function",
  "parseFunction": "function(text) { /* parsing logic */ return {Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer}; }"
}

IMPORTANT: Return ONLY valid JSON with the parseFunction.`;
            } else {
                prompt = `Analyze these sample records and create field mapping.

TARGET SCHEMA: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer

SAMPLE DATA (${uniqueSample.length} rows):
${JSON.stringify(uniqueSample.slice(0, 10), null, 2)}

Return JSON mapping:
{
  "type": "field_mapping",
  "mapping": {"Name": "source_field_name", "City": "source_field_name", ...}
}

IMPORTANT: Return ONLY the mapping object, no explanations.`;
            }

            const estimatedTokens = tracker.estimateTokens(prompt);

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a data mapping expert. Return only valid JSON." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0
            });

            tracker.recordTokens(completion.usage);
            const result = JSON.parse(completion.choices[0].message.content);

            tracker.endStep({
                estimatedTokens,
                actualTokens: completion.usage?.total_tokens,
                sampleSize: uniqueSample.length
            });

            console.log(`[Logic Extractor] ✅ LLM extracted logic using ${completion.usage.total_tokens} tokens`);

            const performance = tracker.logReport();

            return {
                success: true,
                logic: result,
                confidence: analysis.confidence,
                needsLLM: true,
                tokenUsage: completion.usage,
                performance,
                tier: 2,
                message: `Used LLM on ${uniqueSample.length} sample rows to extract mapping logic.`
            };
        }

        // CASE 3: Low confidence - Need full LLM processing
        console.log(`[Logic Extractor] ⚠️ Low confidence (${Math.round(analysis.confidence * 100)}%) - Full LLM processing required`);

        const performance = tracker.logReport();

        return {
            success: false,
            logic: null,
            confidence: analysis.confidence,
            needsLLM: true,
            needsFullProcessing: true,
            tokenUsage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            },
            performance,
            tier: 3,
            message: `Low confidence pattern detection. Recommend full LLM processing with TOON format.`
        };

    } catch (error) {
        console.error('[Logic Extractor] Error:', error.message);
        const performance = tracker.getReport();
        performance.error = error.message;

        return {
            success: false,
            error: error.message,
            logic: null,
            confidence: 0,
            needsLLM: true,
            performance
        };
    }
}

/**
 * Apply extracted logic to full dataset
 * Processes data locally without LLM
 * 
 * @param {Array} fullData - Complete dataset
 * @param {Object} logic - Extracted logic from extractMappingLogic
 * @param {String} fileName - Original filename
 * @returns {Object} - { data, performance }
 */
async function applyLogicToDataset(fullData, logic, fileName = 'unknown') {
    const tracker = new PerformanceTracker(fileName, 'logic-application');

    try {
        console.log(`[Logic Applicator] Applying logic to ${fullData.length} rows`);

        if (!logic || !logic.type) {
            throw new Error('Invalid logic object');
        }

        // CASE 1: Field mapping (simple column mapping)
        if (logic.type === 'field_mapping') {
            tracker.startStep('Apply Field Mapping');
            const mapped = applyJSONMapping(fullData, logic.mapping);
            tracker.endStep({ recordCount: mapped.length });

            // Group by state
            tracker.startStep('Group by State');
            const grouped = {};
            mapped.forEach(record => {
                const state = record.State || 'Unknown';
                if (!grouped[state]) grouped[state] = [];
                grouped[state].push(record);
            });
            tracker.endStep({ stateCount: Object.keys(grouped).length });

            console.log(`[Logic Applicator] ✅ Processed ${mapped.length} records with field mapping`);
            const performance = tracker.logReport();

            return {
                success: true,
                data: grouped,
                performance,
                recordsProcessed: mapped.length
            };
        }

        // CASE 2: Parsing function (for concatenated data)
        if (logic.type === 'parsing_function' && logic.parseFunction) {
            tracker.startStep('Apply Parsing Function');

            // Create function from string
            // eslint-disable-next-line no-new-func
            const parseFunc = new Function('return ' + logic.parseFunction)();

            // Find the data field (should be the only non-empty field)
            const firstRecord = fullData[0];
            const sourceFields = Object.keys(firstRecord);
            const dataField = sourceFields.find(f => firstRecord[f] && firstRecord[f].trim());

            if (!dataField) {
                throw new Error('Could not find data field in records');
            }

            const parsed = [];
            let successCount = 0;
            let failCount = 0;

            for (const record of fullData) {
                try {
                    const extracted = parseFunc(record[dataField]);
                    if (extracted) {
                        parsed.push(extracted);
                        successCount++;
                    }
                } catch (err) {
                    failCount++;
                    if (failCount <= 5) { // Log first 5 failures only
                        console.warn('[Logic Applicator] Failed to parse record:', record[dataField]?.substring(0, 100));
                    }
                }
            }

            tracker.endStep({
                recordCount: parsed.length,
                successCount,
                failCount,
                successRate: `${Math.round(successCount / fullData.length * 100)}%`
            });

            if (parsed.length === 0) {
                throw new Error('Parsing function failed on all records');
            }

            // Group by state
            tracker.startStep('Group by State');
            const grouped = {};
            parsed.forEach(record => {
                const state = record.State || 'Unknown';
                if (!grouped[state]) grouped[state] = [];
                grouped[state].push(record);
            });
            tracker.endStep({ stateCount: Object.keys(grouped).length });

            console.log(`[Logic Applicator] ✅ Parsed ${parsed.length}/${fullData.length} records (${Math.round(successCount / fullData.length * 100)}% success rate)`);
            const performance = tracker.logReport();

            return {
                success: true,
                data: grouped,
                performance,
                recordsProcessed: parsed.length,
                recordsFailed: failCount
            };
        }

        throw new Error(`Unsupported logic type: ${logic.type}`);

    } catch (error) {
        console.error('[Logic Applicator] Error:', error.message);
        const performance = tracker.getReport();
        performance.error = error.message;

        return {
            success: false,
            error: error.message,
            data: null,
            performance
        };
    }
}

module.exports = {
    extractMappingLogic,
    applyLogicToDataset
};

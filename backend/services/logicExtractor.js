const OpenAI = require('openai');
const { analyzeJSONStructure, applyJSONMapping } = require('../utils/jsonAnalyzer');
const { deduplicateWithLogging } = require('../utils/deduplicator');

const PerformanceTracker = require('../utils/performanceTracker');
const ParsingTemplate = require('../models/ParsingTemplate');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Ensure stats directory exists
const LOG_DIR = path.join(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

function logToSystem(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type}] ${message}\n`;

    // Write to file
    fs.appendFileSync(path.join(LOG_DIR, 'data-ingestion.txt'), logLine);

    // Console logging (Cleaned up as requested)
    if (type === 'INFO' || type === 'SUCCESS' || type === 'WARNING' || type === 'ERROR') {
        const icon = type === 'SUCCESS' ? '✅' : type === 'WARNING' ? '⚠️' : type === 'ERROR' ? '❌' : 'ℹ️';
        console.log(`${icon} ${message}`);
    }
}

/**
 * Extract mapping logic from sample data
 * Returns logic that can be applied to full dataset without LLM
 * 
 * @param {Array} sampleData - Sample rows (50-100)
 * @param {String} fileType - Type of file (json, text, etc)
 * @param {String} fileName - Original filename
 * @returns {Object} - { logic, confidence, needsLLM, tokenUsage }
 * @returns {Object} - { logic, confidence, needsLLM, tokenUsage, templateFound }
 */
async function extractMappingLogic(sampleData, fileType, fileName = 'unknown') {
    const tracker = new PerformanceTracker(fileName, 'logic-extraction');


    try {
        logToSystem(`[Logic Extractor] Processing ${sampleData.length} rows for pattern extraction`, 'INFO');

        // Step 1: Detect Signature
        const signature = generateSignature(sampleData);
        logToSystem(`[Logic Extractor] 🔍 Generated Data Signature: ${signature}`, 'INFO');

        // Step 2: Check for existing Template
        tracker.startStep('Check Template Cache');
        const template = await ParsingTemplate.findOne({ signature });
        tracker.endStep({ found: !!template });


        if (template) {
            logToSystem(`[Logic Extractor] ⚡ MATCH FOUND! Using saved template: "${template.name}"`, 'SUCCESS');

            // Increment usage count async
            ParsingTemplate.findByIdAndUpdate(template._id, {
                $inc: { usageCount: 1 },
                $set: { lastUsedAt: new Date() }
            }).exec();

            const performance = tracker.logReport();

            return {
                success: true,
                logic: template.logic,
                confidence: 1, // High confidence on template match
                needsLLM: false,
                source: 'template',
                templateName: template.name,
                tokenUsage: { total_tokens: 0 },
                performance,
                tier: 0, // Tier 0 = Instant Match
                message: `⚡ Instant Match! Recognized format as "${template.name}"`
            };
        }

        // Step 3: Deduplicate sample (if no template found)
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



        // logToSystem(`[Logic Extractor] Local analysis confidence: ${Math.round(analysis.confidence * 100)}%`, 'INFO');

        // CASE 1: High confidence - No LLM needed!
        if (!analysis.needsLLM) {
            logToSystem(`[Logic Extractor] High confidence (${Math.round(analysis.confidence * 100)}%) detected locally. Skipping LLM.`, 'SUCCESS');

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
                source: 'local', // New: explicit source
                message: `Pattern detected locally with ${Math.round(analysis.confidence * 100)}% confidence. No LLM needed.`
            };
        }

        // CASE 2: Medium confidence - Use LLM on sample only
        if (analysis.useSmartLLM) {
            // User requested feeding "first 100 rows" (or a significant chunk)
            const llmSampleSize = Math.min(uniqueSample.length, 100); // Increased to 100 for better context
            logToSystem(`[Logic Extractor] Medium confidence. engaging LLM with first ${llmSampleSize} rows to derive pattern...`, 'WARNING');

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
                logToSystem(`[Logic Extractor] Data appears concatenated in field: "${dataField}"`, 'INFO');

                prompt = `Analyze this sample data and create a parsing function.

TARGET SCHEMA: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer

SAMPLE DATA (${llmSampleSize} rows):
${uniqueSample.slice(0, llmSampleSize).map(r => r[dataField]).join('\n')}

Return a JavaScript function that can parse each concatenated string:
{
  "type": "parsing_function",
  "parseFunction": "function(text) { /* parsing logic */ return {Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer}; }"
}

IMPORTANT: Return ONLY valid JSON with the parseFunction.`;
            } else {
                prompt = `Analyze these sample records and create field mapping.

TARGET SCHEMA: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer

SAMPLE DATA (${llmSampleSize} rows):
${JSON.stringify(uniqueSample.slice(0, llmSampleSize), null, 2)}

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

            logToSystem(`[Logic Extractor] LLM successfully extracted logic (Tokens: ${completion.usage.total_tokens})`, 'SUCCESS');

            return {
                success: true,
                logic: result,
                confidence: analysis.confidence,
                needsLLM: true,
                source: 'gpt',
                signature, // Return signature so frontend can save it later
                tokenUsage: completion.usage,
                performance,
                tier: 2,
                message: `Used LLM on ${uniqueSample.length} sample rows to extract mapping logic.`
            };
        }

        // CASE 3: Low confidence - Need full LLM processing
        logToSystem(`[Logic Extractor] Low confidence (${Math.round(analysis.confidence * 100)}%). Full LLM processing required.`, 'WARNING');

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
            source: 'gpt', // Will fall back to GPT/TOON
            message: `Low confidence pattern detection. Recommend full LLM processing with TOON format.`
        };


    } catch (error) {
        logToSystem(`[Logic Extractor] Error: ${error.message}`, 'ERROR');
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
        logToSystem(`[Logic Applicator] Applying logic to ${fullData.length} total rows...`, 'INFO');

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

            logToSystem(`[Logic Applicator] Successfully mapped ${mapped.length} records.`, 'SUCCESS');
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
                        logToSystem(`[Logic Applicator] Failed to parse record: ${record[dataField]?.substring(0, 100)}`, 'WARNING');
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

            logToSystem(`[Logic Applicator] Successfully parsed ${parsed.length}/${fullData.length} records (${Math.round(successCount / fullData.length * 100)}% success rate)`, 'SUCCESS');
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
        logToSystem(`[Logic Applicator] Error: ${error.message}`, 'ERROR');
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

/**
 * Generate a unique signature for the data structure
 * Uses headers (if JSON) or data pattern to create a hash
 */
function generateSignature(sampleData) {
    if (!sampleData || sampleData.length === 0) return 'empty';

    const firstRow = sampleData[0];

    // Strategy 1: JSON Keys (Structured)
    if (typeof firstRow === 'object' && firstRow !== null) {
        const keys = Object.keys(firstRow).sort();
        // If keys are generic (0, 1, 2) it's likely an array-based structure, look deeper?
        // For now, keys are a good proxy.
        const keyString = keys.join('|');
        return crypto.createHash('md5').update(keyString).digest('hex');
    }

    // Strategy 2: String/Text (Structure via Type?)
    // This is harder to fingerprint purely. We might fallback to 'unknown' or hash the first line structure?
    return 'unknown_structure';
}

module.exports = {
    extractMappingLogic,
    applyLogicToDataset
}

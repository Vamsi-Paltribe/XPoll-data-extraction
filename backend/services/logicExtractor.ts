import OpenAI from 'openai';
import { PROMPTS } from '../config/prompts';
import { analyzeJSONStructure, applyJSONMapping } from '../utils/jsonAnalyzer';
import { deduplicateWithLogging } from '../utils/deduplicator';
import PerformanceTracker from '../utils/performanceTracker';
import { ParsingTemplate, IParsingTemplate } from '../models/ParsingTemplate';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Ensure stats directory exists
const LOG_DIR = path.join(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const SKIP_SCENARIO_A_TYPES = ['text', 'pdf_text', 'pdf', 'txt', 'image'];

function logToSystem(message: string, type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' = 'INFO') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type}] ${message}\n`;

    // Write to file
    fs.appendFileSync(path.join(LOG_DIR, 'data-ingestion.txt'), logLine);

    // Console logging
    if (type === 'INFO' || type === 'SUCCESS' || type === 'WARNING' || type === 'ERROR') {
        const icon = type === 'SUCCESS' ? '✅' : type === 'WARNING' ? '⚠️' : type === 'ERROR' ? '❌' : 'ℹ️';
        console.log(`${icon} ${message}`);
    }
}

interface LogicResult {
    success: boolean;
    logic: any;
    confidence: number;
    needsLLM: boolean;
    source?: string;
    templateName?: string;
    tokenUsage?: any;
    performance: any;
    tier?: number;
    message?: string;
    signature?: string;
    needsFullProcessing?: boolean;
    error?: string;
    data?: any;
}

export interface ExecutionResult {
    success: boolean;
    data?: Record<string, any[]>;
    allRecords?: any[]; // For preserving file order
    error?: string;
    recordsProcessed?: number;
    recordsFailed?: number;
    performance: any;
}

export async function invalidateTemplate(signature: string) {
    try {
        await ParsingTemplate.deleteOne({ signature });
        logToSystem(`[Logic Extractor] 🗑️ Invalidated/Deleted bad template: ${signature}`, 'WARNING');
    } catch (e) {
        console.error('Failed to invalidate template:', e);
    }
}

export async function invalidateTemplateByName(name: string) {
    try {
        await ParsingTemplate.deleteOne({ name });
        logToSystem(`[Logic Extractor] 🗑️ Invalidated/Deleted bad template by NAME: ${name}`, 'WARNING');
    } catch (e) {
        console.error('Failed to invalidate template by name:', e);
    }
}

/**
 * Extract mapping or parsing logic from sample data.
 * Supports: JSON (Array of Objects), Text (Raw PDF/TXT content)
 * 
 * @param {Array|string} sampleInput - Sample rows or raw text
 * @param {String} fileType - 'json', 'text', 'pdf_text'
 * @param {String} fileName - Original filename
 */
export async function extractMappingLogic(sampleInput: any, fileType: string, fileName: string = 'unknown', parameters: any[] = []): Promise<LogicResult> {
    const tracker = new PerformanceTracker(fileName, 'logic-extraction');

    // Normalize Input
    let sampleData: any[] = [];
    let rawTextSample = "";

    // If input is array (JSON/CSV), use it. If text, sample lines.
    if (Array.isArray(sampleInput)) {
        sampleData = sampleInput;
    } else if (typeof sampleInput === 'string') {
        rawTextSample = sampleInput.substring(0, 25000); // Increased to 25k for better global context
        // Ensure we have enough lines for line-based sampling if needed
        sampleData = rawTextSample.split('\n').filter(l => l.trim().length > 0).slice(0, 100);
    }

    // Step 1: Detect Signature (Includes Parameters to avoid stale data if schema changes)
    const signature = generateSignature(sampleData, fileType, parameters);
    logToSystem(`[Logic Extractor] 🔍 Generated Data Signature: ${signature} (Type: ${fileType})`, 'INFO');

    try {
        logToSystem(`[Logic Extractor] Processing ${fileType} for logic extraction...`, 'INFO');

        // Step 1.5: Skip Scenario A for specific types (PDF, TXT, Image)
        // We FORCE Scenario B (Direct LLM) for these types to ensure maximum integrity
        const isSkippableType = SKIP_SCENARIO_A_TYPES.includes(fileType);

        if (isSkippableType) {
            logToSystem(`[Logic Extractor] ⏭️ FORCING Scenario B (Direct LLM) for skippable type: ${fileType}.`, 'INFO');
            return {
                success: false,
                logic: null,
                confidence: 0,
                needsLLM: true,
                needsFullProcessing: true,
                performance: tracker.logReport(),
                message: `Scenario A disabled for ${fileType}. Forced Scenario B.`,
                error: `Scenario A disabled for ${fileType}. Direct extraction required for accuracy.`
            };
        }

        // Step 2: Check Template Cache
        let template: IParsingTemplate | null = null;
        try {
            tracker.startStep('Check Template Cache');
            // Timeout after 2s to not block if DB is slow/disconnected
            template = await ParsingTemplate.findOne({ signature }).maxTimeMS(2000) as IParsingTemplate | null;
            tracker.endStep({ found: !!template });
        } catch (dbErr) {
            console.warn(`[Logic Extractor] ⚠️ Cache lookup failed or timed out. Proceeding to fresh analysis.`);
            tracker.endStep({ found: false, error: 'DB Timeout/Error' });
        }

        if (template) {
            logToSystem(`[Logic Extractor] ⚡ MATCH FOUND! Using saved template: "${template.name}"`, 'SUCCESS');
            try {
                ParsingTemplate.findByIdAndUpdate(template._id, { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } }).exec().catch(() => { });
            } catch (e) { }

            return {
                success: true,
                logic: template.logic,
                confidence: 1,
                needsLLM: false,
                source: 'template',
                templateName: template.name,
                tokenUsage: { total_tokens: 0 },
                performance: tracker.logReport(),
                tier: 0,
                signature: template.signature || signature, // Prefer DB signature
                message: `⚡ Instant Match! Recognized format as "${template.name}"`
            };
        }

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Build target schema string (STRICT: No fallbacks)
        const targetSchema = parameters.length > 0
            ? parameters.map(p => p.name).join(', ')
            : "Detected fields from document headers";



        // --- BRANCH 1: STRUCTURAL ANALYSIS (JSON/CSV-like) ---
        if (fileType === 'json') {
            const desiredSampleSize = (sampleInput as any)._forceSampleSize || 50;

            // Step 3: Deduplicate sample
            tracker.startStep(`Deduplicate Sample (${desiredSampleSize} rows)`);
            const dedupResult = deduplicateWithLogging(sampleData.slice(0, desiredSampleSize), fileName);
            const uniqueSample = dedupResult.unique;
            tracker.endStep({ stats: dedupResult.stats });

            tracker.startStep('Analyze Structure Locally');
            const analysis = analyzeJSONStructure(uniqueSample, parameters, uniqueSample.length);
            tracker.endStep({ confidence: analysis.confidence });

            // SUB-BRANCH A: High Confidence (Local Mapping)
            // Only accept local if confidence is remarkably high (e.g. > 0.95), otherwise prefer LLM for robustness if user wants
            if (!analysis.needsLLM && (analysis.confidence || 0) > 0.9) {
                return {
                    success: true,
                    logic: { type: 'field_mapping', mapping: analysis.mapping, confidence: analysis.confidence },
                    confidence: analysis.confidence || 0,
                    needsLLM: false,
                    performance: tracker.logReport(),
                    tier: 1,
                    source: 'local',
                    message: `Pattern detected locally with ${Math.round((analysis.confidence || 0) * 100)}% confidence.`
                };
            }

            // SUB-BRANCH B: LLM Logic Extraction
            const llmSampleSize = Math.min(uniqueSample.length, desiredSampleSize);
            logToSystem(`[Logic Extractor] Engaging LLM on ${llmSampleSize} rows...`, 'INFO');

            // Check concatenation
            const firstRecord = uniqueSample[0];
            const sourceFields = Object.keys(firstRecord);
            const nonEmptyFields = sourceFields.filter(f => firstRecord[f] && String(firstRecord[f]).trim());
            const isConcatenated = nonEmptyFields.length === 1;

            // ... existing code ...

            let prompt;
            if (isConcatenated) {
                const dataField = nonEmptyFields[0];
                prompt = `You are an enterprise-grade JavaScript Expert. Write a function to parse this specific data format with MAXIMUM ACCURACY.

Accuracy is MORE IMPORTANT than speed, cost, or brevity.

TARGET SCHEMA: ${targetSchema}

------------------------------------------------
CORE PARSING RULES
------------------------------------------------
1. Accuracy is PARAMOUNT. If data is ambiguous, return null or empty string.
2. Write a Javascript function named \`parseRecord\` that takes a single string input and returns a JSON object.
3. Every field in the TARGET SCHEMA must be present in the output object (use "" if missing).

------------------------------------------------
RECORD INCLUSION POLICY
------------------------------------------------
- A row is considered VALID if it contains a value for at least 2 TARGET PARAMETERS.
- If it has only one parameter (e.g. only Name), return null/skip it.
- Skip headers, footers, and summary rows.

------------------------------------------------
REGULAR EXPRESSIONS
------------------------------------------------
- Use \`new RegExp('pattern', 'flags')\` for safety.
- Extract fields accurately using named groups or position.

SAMPLE RAW DATA:
${uniqueSample.slice(0, 50).map((r: any) => r[dataField]).join('\n')}

RETURN JSON ONLY:
{
  "type": "parsing_function",
  "parseFunction": "function(text) { ... }",
  "instructions": "Ensure results follow the target schema."
}`;
            } else {
                // Use the STRICT prompt from prompts.ts
                prompt = PROMPTS.EXTRACTOR_FIELD_MAPPING(
                    targetSchema,
                    JSON.stringify(uniqueSample.slice(0, 5), null, 2)
                );
            }

            tracker.startStep('LLM Logic Extraction (JSON)');
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: "You are a code generator." }, { role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0
            });
            tracker.recordTokens(completion.usage);
            const logic = JSON.parse(completion.choices[0].message.content || '{}');
            tracker.endStep();

            // --- RECURSIVE IMPROVEMENT CHECK ---
            // If the LLM wasn't confident or the logic seems trivial, and we only used 50 rows, TRY AGAIN with MORE data.
            if (desiredSampleSize < 150 && logic.type === 'parsing_function') {
                logToSystem('\n\n================================================================================================', 'INFO');
                logToSystem(`[Logic Extractor] 🔄 RECURSIVE IMPROVEMENT ACTIVATED: Extending sample size 50 -> 150 rows`, 'INFO');
                logToSystem('================================================================================================\n\n', 'INFO');

                // Recursive call with larger sample size
                // We attach the flag to the array since we pass 'sampleInput' back
                if (Array.isArray(sampleInput)) {
                    (sampleInput as any)._forceSampleSize = 150;
                    return extractMappingLogic(sampleInput, fileType, fileName, parameters);
                }
            }

            if (logic) {
                try {
                    await ParsingTemplate.create({
                        name: `Auto-Gen ${fileType} ${fileName.substring(0, 10)}`,
                        signature,
                        logic,
                        sampleData: sampleData.slice(0, 5)
                    });
                } catch (e) { }
            }

            return {
                success: true,
                logic,
                confidence: 0.9,
                needsLLM: true,
                source: 'gpt',
                signature,
                performance: tracker.logReport(),
                tier: 2
            };
        }

        // --- BRANCH 2: TEXT/PDF ANALYSIS (Raw String) ---
        logToSystem(`[Logic Extractor Debug] Checking Text Mode for type: '${fileType}'`, 'INFO');

        if (fileType === 'text' || fileType === 'pdf_text' || fileType === 'pdf' || fileType === 'txt') {
            logToSystem(`[Logic Extractor] Engaging LLM on Raw Text (PDF/TXT)...`, 'INFO');

            const prompt = `You are an enterprise-grade JavaScript Data Extraction Expert. Write a function to extract structured data from Raw Text/PDF content with MAXIMUM ACCURACY.

Accuracy is MORE IMPORTANT than speed, cost, or brevity.

TARGET SCHEMA: ${targetSchema}

------------------------------------------------
CORE PARSING RULES
------------------------------------------------
1. Accuracy is PARAMOUNT.
2. You MUST extract EVERY VALID RECORD.
3. Values MUST remain perfectly aligned (no column shifting).
4. If a field is missing in the text, return "". NEVER guess.

------------------------------------------------
RECORD INCLUSION POLICY
------------------------------------------------
A row is considered VALID if:
- It contains a value for at least 2 TARGET PARAMETERS.
- The values clearly belong to the same logical record.

A row is INVALID if:
- It contains only a single isolated value (e.g. just a page number).
- It is a header or footer.
- It is a summary/total row.

------------------------------------------------
SEMANTIC MAPPING RULES
------------------------------------------------
Detect source columns and map them to the TARGET SCHEMA naturally based on document headers.

------------------------------------------------
TECHNICAL INSTRUCTIONS
------------------------------------------------
1. Write a Javascript function \`parseText(fullText)\` that takes the full string.
2. It MUST return an Array of Objects.
3. Handle "smashed" text (missing spaces) using specific field patterns (e.g. Regex for Zip codes, Names).
4. **REGEX SAFETY**: Use \`new RegExp('pattern', 'flags')\` to avoid syntax errors with slashes.
5. Use consistent keys exactly as defined in TARGET SCHEMA: ${targetSchema}.

SAMPLE RAW TEXT:
${rawTextSample.substring(0, 4000)}

RETURN JSON ONLY:
{
  "type": "parsing_function",
  "parseFunction": "function(fullText) { ... }",
  "explanation": "Brief description of the strategy used."
}`;

            tracker.startStep('LLM Logic Extraction (Text)');
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: "You are a code generator." }, { role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0
            });
            tracker.recordTokens(completion.usage);
            const logic = JSON.parse(completion.choices[0].message.content || '{}');
            tracker.endStep();

            if (logic) {
                try {
                    await ParsingTemplate.create({
                        name: `Auto-Gen ${fileType} ${fileName.substring(0, 10)}`,
                        signature,
                        logic,
                        sampleData: [rawTextSample.substring(0, 500)]
                    });
                } catch (e) { }
            }

            return {
                success: true,
                logic,
                confidence: 0.85,
                needsLLM: true,
                source: 'gpt',
                signature,
                performance: tracker.logReport(),
                tier: 2
            };
        }

        return { success: false, error: `Unsupported file type: ${fileType}`, logic: null, confidence: 0, needsLLM: true, performance: tracker.getReport() };

    } catch (error: any) {
        logToSystem(`[Logic Extractor] Error: ${error.message}`, 'ERROR');
        return { success: false, error: error.message, logic: null, confidence: 0, needsLLM: true, performance: tracker.getReport() };
    }
}

/**
 * Apply the extracted logic to the FULL dataset.
 * 
 * @param {Array|string} inputData - Full array of rows OR Full text string
 * @param {Object} logic - The strategy returned by extractMappingLogic
 */
export async function applyLogicToDataset(inputData: any, logic: any, fileName: string = 'unknown'): Promise<ExecutionResult> {
    const tracker = new PerformanceTracker(fileName, 'logic-application');

    // Normalize Input
    let fullRecords: any[] = [];
    let fullText = "";
    const isTextMode = typeof inputData === 'string';

    if (isTextMode) fullText = inputData as string;
    else fullRecords = inputData as any[];

    try {
        logToSystem(`[Logic Applicator] Applying strategy '${logic.type}'...`, 'INFO');

        // MODE: PARSING FUNCTION (Row-by-Row OR Full Text)
        if (logic.type === 'parsing_function' && logic.parseFunction) {
            tracker.startStep('Apply Custom Parsing Function');
            // eslint-disable-next-line no-new-func
            let parseFunc;
            try {
                parseFunc = new Function('return ' + logic.parseFunction)();
            } catch (err: any) {
                logToSystem(`[Logic Applicator] ❌ Error compiling generated function: ${err.message}\nCode: ${logic.parseFunction}`, 'ERROR');
                // @ts-ignore
                tracker.error = `Compilation Error: ${err.message}`;
                return { success: false, error: `Compilation Error: ${err.message}`, performance: tracker.getReport() };
            }

            let parsed: any[] = [];

            if (isTextMode) {
                // Function handles whole text? or we split lines?
                // Logic extraction prompt asked for "text -> Array" for Option C.
                try {
                    parsed = parseFunc(fullText);
                } catch (e: any) {
                    logToSystem(`[Logic Applicator] ⚠️ Full text parse failed: ${e.message}. Retrying line-by-line...`, 'WARNING');
                    // Try line by line fallback if function expects a line
                    const lines = fullText.split('\n');
                    parsed = lines.map(l => {
                        try { return parseFunc(l); } catch (err) { return null; }
                    }).filter(r => r);
                }
            } else {
                // Array input (JSON/CSV rows)
                // Identify data field
                const first = fullRecords[0];
                const key = Object.keys(first).find(k => first[k] && typeof first[k] === 'string');
                if (key) {
                    parsed = fullRecords.map((r, idx) => {
                        try { return parseFunc(r[key]); } catch (err: any) {
                            if (idx < 5) logToSystem(`[Logic Applicator] ⚠️ Row ${idx} parse error: ${err.message}`, 'WARNING');
                            return null;
                        }
                    }).filter(r => r);
                }
            }

            // Cleanup & Deduplicate result (Flatten if necessary)
            if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
                // If function returned array of arrays (chunks)
                parsed = parsed.flat();
            }
            parsed = parsed.filter(x => x && Object.keys(x).length > 0);

            tracker.endStep({ count: parsed.length });

            return finishProcessing(parsed, tracker);
        }

        // MODE: REGEX MATCHER (Text Splitter)
        if (logic.type === 'regex_matcher') {
            tracker.startStep('Apply Regex Matcher');
            let records: any[] = [];

            // 1. Split into "Logical Rows"
            let rawRows: string[] = [];
            if (logic.recordStartRegex) {
                const flags = logic.recordStartRegexFlags || 'gm';
                // Remove slashes if present in string (e.g. "/.../gm")
                const cleanRegex = logic.recordStartRegex.replace(/^\/|\/[a-z]*$/g, '');
                // FIX: Restrict to safe flags (g, i, m) to avoid invalid flag errors
                const splitRegex = new RegExp(cleanRegex, flags.replace(/[^gim]/g, ''));

                const lines = isTextMode ? fullText.split('\n') : fullRecords.map(r => JSON.stringify(r));

                let buffer = "";
                for (const line of lines) {
                    // Heuristic: If line matches start regex, flush buffer
                    if (splitRegex.test(line)) {
                        if (buffer.trim()) rawRows.push(buffer);
                        buffer = line;
                    } else {
                        buffer += " " + line; // Append to previous
                    }
                }
                if (buffer.trim()) rawRows.push(buffer);
            } else {
                rawRows = isTextMode ? fullText.split('\n') : fullRecords.map(Object.values).flat();
            }

            // 2. Extract Fields
            if (logic.fieldExtractionRegex) {
                const cleanExtract = logic.fieldExtractionRegex.replace(/^\/|\/[a-z]*$/g, '');
                const extractRegex = new RegExp(cleanExtract, 'i'); // Case insensitive default
                records = rawRows.map(row => {
                    const match = extractRegex.exec(row);
                    return match ? match.groups : null;
                }).filter(r => r);
            } else {
                // No specific extraction, just return rows? Unlikely.
            }

            tracker.endStep({ count: records.length });
            return finishProcessing(records, tracker);
        }

        // MODE: DELIMITER / HEADER
        if (logic.type === 'delimiter' || logic.type === 'field_mapping') {
            // If field_mapping, we just map keys.
            if (logic.mapping) {
                const mapped = applyJSONMapping(fullRecords, logic.mapping);
                return finishProcessing(mapped, tracker);
            }

            // If delimiter (Text Mode)
            if (isTextMode && logic.delimiter) {
                const lines = fullText.split('\n').filter(l => l.trim());
                const headers = logic.headers || [];
                const records = lines.map(l => {
                    const parts = l.split(logic.delimiter);
                    const rec: any = {};
                    headers.forEach((h: string, i: number) => rec[h] = parts[i]);
                    return rec;
                });
                return finishProcessing(records, tracker);
            }
        }

        return { success: false, error: "Unknown logic type or mismatch", performance: tracker.getReport() };

    } catch (error: any) {
        logToSystem(`[Logic Applicator] Error: ${error.message}`, 'ERROR');
        // @ts-ignore
        tracker.error = error.message;
        return { success: false, error: error.message, performance: tracker.getReport() };
    }
}

function finishProcessing(records: any[], tracker: PerformanceTracker) {
    // Group records (Try State, then City, then Category, then default to Records)
    tracker.startStep('Group Records');
    const grouped: Record<string, any[]> = {};
    records.forEach(record => {
        const groupKey = record.State || record.City || record.Category || 'Records';
        if (!grouped[groupKey]) grouped[groupKey] = [];
        grouped[groupKey].push(record);
    });
    tracker.endStep({ stateCount: Object.keys(grouped).length });

    return {
        success: true,
        data: grouped,
        recordsProcessed: records.length,
        performance: tracker.logReport()
    };
}


function generateSignature(data: any, type: string, parameters: any[] = []) {
    if (!data) return 'empty';
    if (Array.isArray(data) && data.length === 0) return 'empty';

    // Create a string representing the target parameters
    const paramString = parameters.map(p => p.name).sort().join('|');

    // If Text: Hash first 500 chars + Type + Parameters
    if (typeof data === 'string') {
        const snippet = data.substring(0, 500);
        return crypto.createHash('md5').update(type + snippet + paramString + 'v3-user-prompt').digest('hex');
    }

    // If Array
    if (Array.isArray(data)) {
        const firstRow = data[0];
        // Text Lines (Array of strings)
        if (typeof firstRow === 'string') {
            const snippet = data.slice(0, 10).join('\n').substring(0, 500);
            return crypto.createHash('md5').update(type + snippet + paramString + 'v3-user-prompt').digest('hex');
        }
        // JSON Objects
        if (typeof firstRow === 'object' && firstRow !== null) {
            const keys = Object.keys(firstRow).sort();
            const keyString = keys.join('|');
            return crypto.createHash('md5').update(type + keyString + paramString + 'v3-user-prompt').digest('hex');
        }
    }
    // Fallback
    return crypto.createHash('md5').update(type + 'unknown' + paramString + 'v3-user-prompt').digest('hex');
}

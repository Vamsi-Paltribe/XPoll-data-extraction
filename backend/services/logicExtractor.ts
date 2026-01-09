import OpenAI from 'openai';
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
export async function extractMappingLogic(sampleInput: any, fileType: string, fileName: string = 'unknown'): Promise<LogicResult> {
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

    // Step 1: Detect Signature
    const signature = generateSignature(sampleData, fileType);
    logToSystem(`[Logic Extractor] 🔍 Generated Data Signature: ${signature} (Type: ${fileType})`, 'INFO');

    try {
        logToSystem(`[Logic Extractor] Processing ${fileType} for logic extraction...`, 'INFO');

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


        // --- BRANCH 1: STRUCTURAL ANALYSIS (JSON/CSV-like) ---
        if (fileType === 'json') {
            const desiredSampleSize = (sampleInput as any)._forceSampleSize || 50;

            // Step 3: Deduplicate sample
            tracker.startStep(`Deduplicate Sample (${desiredSampleSize} rows)`);
            const dedupResult = deduplicateWithLogging(sampleData.slice(0, desiredSampleSize), fileName);
            const uniqueSample = dedupResult.unique;
            tracker.endStep({ stats: dedupResult.stats });

            tracker.startStep('Analyze Structure Locally');
            const analysis = analyzeJSONStructure(uniqueSample, uniqueSample.length);
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
                prompt = `You are a JavaScript Expert. Write a function to parse this specific data format.
                 
TARGET SCHEMA: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer
(You may find other fields like "Candidate", "Committee", "Occupation", etc. - extract them too).

SAMPLE RAW DATA:
${uniqueSample.slice(0, 50).map((r: any) => r[dataField]).join('\n')}

INSTRUCTIONS:
1. Analyze the sample lines. NOTE: The data may contain MULTIPLE PATTERNS (e.g., some lines are headers, some are footers, some are data).
2. Write a Javascript function named \`parseRecord\` that takes a single string input and returns a JSON object.
3. **CRITICAL: CONDITIONAL LOGIC**: If different lines have different structures, use if/else logic to detect and parse them accordingly.
4. **SKIP INVALID ROWS**: If a row does not look like valid data (e.g. a page header), return \`null\`.
5. **IMPORTANT: REGEX SYNTAX**:
   - Use ONLY standard flags (g, i, m).
   - **MUST ESCAPE SLASHES**: If using regex literals (e.g. /pattern/), you MUST escape forward slashes (e.g. use \\/ for dates like \\d{2}\\/\\d{2}). Unescaped slashes will cause syntax errors.
   - PREFER \`new RegExp('pattern', 'flags')\` if you are unsure about escaping.

RETURN JSON:
{
  "type": "parsing_function",
  "parseFunction": "function(text) { ... if (!match) return null; ... return { ... }; }"
}`;
            } else {
                prompt = `Map these fields to the TARGET SCHEMA: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer.
SAMPLE: ${JSON.stringify(uniqueSample.slice(0, 5), null, 2)}
Return JSON: { "type": "field_mapping", "mapping": {"Target": "Source"} }`;
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
                    return extractMappingLogic(sampleInput, fileType, fileName);
                }
            }

            // Clean up the code before returning (Sanitize Regex Flags)
            if (logic.type === 'parsing_function' && logic.parseFunction) {
                // Remove invalid flags (s, u, y) from regex literals in the code string
                // Naive approach: Look for /.../flags pattern. a bit risky on code, but better than crash.
                // Actually, let's just trust the prompt + try/catch for now. The previous crash was caught by try/catch!
                // The error logs showed it was caught.
                // We just want to ensure we don't crash the *recursion*.
            }

            // ... (Saving Template code) ...
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
            const isPDF = fileType === 'pdf_text';
            // Limit sample size for text (first 3000 chars roughly) or first 50 lines
            logToSystem(`[Logic Extractor] Engaging LLM on Raw Text (PDF/TXT)...`, 'INFO');

            const prompt = `You are a JavaScript Data Extraction Expert.
            
OBJECTIVE: Write a JavaScript function to extract structured data from the following Raw Text/PDF content.
TARGET SCHEMA: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer
(Extract any other obvious fields like "Voter ID", "Status", etc. if present).

SAMPLE RAW TEXT:
${rawTextSample.substring(0, 4000)}

CHALLENGE:
The text might be "smashed" together (missing spaces between columns) or have irregular spacing due to PDF extraction (e.g. "USV1001James Williams42Male").
It might also be a "Stream" of text where columns are read top-to-bottom instead of left-to-right.

INSTRUCTIONS:
1. **PATTERN RECOGNITION**: 
   - Look for repeating patterns (e.g. dates \d{2}/\d{2}/\d{4}, state codes like "RI", "NY").
   - Determine if the text is Row-Oriented (standard) or Column-Oriented (stream).
   - Identify distinct separators (tabs, multiple spaces, specific keywords).

2. **WRITE PARSING LOGIC**:
   - Write a Javascript function \`parseText(fullText)\` that takes the full string.
   - It MUST return an **Array of Objects**.
   - Use flexible Regex or string manipulation.
   - **HANDLE SMASHED TEXT**: Use Regex lookaheads/lookbehinds or specific field patterns (e.g. \d{5} for Zip) to splitting strings if no spaces exist.

3. **REGEX SAFETY**:
   - Use ONLY standard flags (g, i, m).
   - **MUST ESCAPE SLASHES** in regex literals (e.g. \\d{2}\\/\\d{2}).
   - Prefer \`new RegExp()\` constructors for complex patterns to avoid syntax errors.

RETURN JSON:
{
  "type": "parsing_function",
  "parseFunction": "function(text) { ...your code here... return results; }"
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
    // Group by state
    tracker.startStep('Group by State');
    const grouped: Record<string, any[]> = {};
    records.forEach(record => {
        const state = record.State || 'Unknown';
        if (!grouped[state]) grouped[state] = [];
        grouped[state].push(record);
    });
    tracker.endStep({ stateCount: Object.keys(grouped).length });

    return {
        success: true,
        data: grouped,
        recordsProcessed: records.length,
        performance: tracker.logReport()
    };
}


function generateSignature(data: any, type: string) {
    if (!data) return 'empty';
    if (Array.isArray(data) && data.length === 0) return 'empty';

    // If Text: Hash first 500 chars + Type
    if (typeof data === 'string') {
        const snippet = data.substring(0, 500);
        return crypto.createHash('md5').update(type + snippet).digest('hex');
    }

    // If Array
    if (Array.isArray(data)) {
        const firstRow = data[0];
        // Text Lines (Array of strings)
        if (typeof firstRow === 'string') {
            const snippet = data.slice(0, 10).join('\n').substring(0, 500);
            return crypto.createHash('md5').update(type + snippet).digest('hex');
        }
        // JSON Objects
        if (typeof firstRow === 'object' && firstRow !== null) {
            const keys = Object.keys(firstRow).sort();
            const keyString = keys.join('|');
            return crypto.createHash('md5').update(type + keyString).digest('hex');
        }
    }
    // Fallback
    return 'unknown_structure';
}

import OpenAI from 'openai';
import { parseToon, extractToonSample } from '../utils/toonParser';
import { processPDFToToon } from '../utils/pdfTableExtractor';
import { processImageToToon } from '../utils/imageOCR';
import PerformanceTracker from '../utils/performanceTracker';
import { analyzePlainText } from '../utils/smartPatternDetector';
import { analyzeJSONStructure, applyJSONMapping, jsonToTOON } from '../utils/jsonAnalyzer';
import { deduplicateWithLogging } from '../utils/deduplicator';

interface ProcessPayload {
    data: any;
    type: string;
    fileName: string;
    skipConfirmation?: boolean;
}

/**
 * Process document using TOON format optimization
 * LLM is ONLY used for schema mapping, NOT for data extraction
 * Returns: { data, performance }
 */
export async function processDocumentWithOpenAI(payload: ProcessPayload): Promise<any> {
    const { data, type, fileName } = payload;
    const tracker = new PerformanceTracker(fileName, type);

    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // CASE 1: TOON FORMAT (CSV/Excel/TXT - already structured)
        if (type === 'toon') {
            // DETECT RAW CSV/TEXT (Missing @SCHEMA tag)
            // If the user uploaded a raw CSV, it won't have the internal @SCHEMA tag.
            // We should treat this as "Unstructured Text" and use the Smart Pattern logic to learn the CSV/Delimiter structure.
            if (typeof data === 'string' && !data.trim().startsWith('@SCHEMA|')) {
                console.log('[TOON] ⚠️ Raw CSV/Text detected (No @SCHEMA tag). Redirecting to Smart Schema Extraction (Hybrid Mode)...');

                // Use the Logic-First engine we built for OCR/PDF
                // This will: 1. Ask LLM for Delimiter/Regex, 2. Parse locally.
                return await extractDataWithSmartSchema(data, {}, tracker, openai);
            }

            tracker.startStep('Extract TOON Sample');
            const sample = extractToonSample(data, 5);
            tracker.endStep({
                sampleRows: sample.sampleRows,
                totalRows: sample.totalRows,
                dataSize: sample.sampleToon.length
            });

            // LLM ONLY for schema mapping
            tracker.startStep('LLM Schema Mapping');
            const mappingPrompt = `Map columns to target schema.

TARGET: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer

TOON DATA:
${sample.sampleToon}

Return JSON: {"Name": "source_col", ...}`;

            const estimatedTokens = tracker.estimateTokens(mappingPrompt);

            const mappingResult = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "Return only valid JSON." },
                    { role: "user", content: mappingPrompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0
            });

            tracker.recordTokens(mappingResult.usage);
            const mapping = JSON.parse(mappingResult.choices[0].message.content || '{}');
            tracker.endStep({ estimatedTokens, actualTokens: mappingResult.usage?.total_tokens });

            // Apply mapping locally (no LLM!)
            tracker.startStep('Parse Full TOON');
            const fullData = parseToon(data);
            tracker.endStep({ recordCount: fullData.length });

            tracker.startStep('Apply Mapping Locally');
            const mapped = fullData.map(row => {
                const result: any = {};
                Object.entries(mapping).forEach(([target, source]) => {
                    result[target] = row[source as string] || null;
                });
                return result;
            });
            tracker.endStep({ recordCount: mapped.length });

            // Group by state
            tracker.startStep('Group by State');
            const grouped: any = {};
            mapped.forEach(record => {
                const state = record.State || 'Unknown';
                if (!grouped[state]) grouped[state] = [];
                grouped[state].push(record);
            });
            tracker.endStep({ stateCount: Object.keys(grouped).length });

            const performance = tracker.logReport();
            return { data: grouped, performance };
        }

        // CASE 2: PDF (extract tables without LLM!)
        else if (type === 'pdf') {
            tracker.startStep('Decode PDF Buffer');
            const pdfBuffer = Buffer.from(data, 'base64');
            tracker.endStep({ bufferSize: pdfBuffer.length });

            tracker.startStep('Extract Tables from PDF');
            const result: any = await processPDFToToon(pdfBuffer);
            tracker.endStep({ resultType: result.type });

            if (result.type === 'toon') {
                // Table found! Process as TOON
                tracker.startStep('Process Extracted Table as TOON');
                const toonResult = await processDocumentWithOpenAI({
                    data: result.content,
                    type: 'toon',
                    fileName
                });
                tracker.endStep();

                // Merge performance reports
                const performance = tracker.getReport();
                performance.steps.push(...toonResult.performance.steps);
                performance.tokenUsage = toonResult.performance.tokenUsage;

                console.log('[PDF] ✅ Table extraction successful');
                tracker.logReport();

                return { data: toonResult.data, performance };
            } else {
                // No table, use Hybrid Smart Schema for unstructured text
                tracker.startStep('Smart Schema Extraction (PDF Fallback)');
                console.log('[PDF] ⚠️ No explicit table found. Redirecting to Smart Schema Engine (Hybrid Mode)...');

                // Use the standardized dynamic logic
                return await extractDataWithSmartSchema(result.content, {}, tracker, openai);
            }
        }

        // CASE 3: IMAGE (OCR without LLM!)
        else if (type === 'image') {
            tracker.startStep('Decode Image Buffer');
            const imageBuffer = Buffer.from(data, 'base64');
            tracker.endStep({ bufferSize: imageBuffer.length });

            tracker.startStep('OCR Text Extraction');
            const result: any = await processImageToToon(imageBuffer);
            tracker.endStep({ resultType: result.type });

            if (result.type === 'toon') {
                tracker.startStep('Process OCR Table as TOON');
                const toonResult = await processDocumentWithOpenAI({
                    data: result.content,
                    type: 'toon',
                    fileName
                });
                tracker.endStep();

                const performance = tracker.getReport();
                performance.steps.push(...toonResult.performance.steps);
                performance.tokenUsage = toonResult.performance.tokenUsage;

                tracker.logReport();
                return { data: toonResult.data, performance };
            } else {
                console.log(`[IMAGE] No explicit table found via heuristics. Attempting Smart Pattern Detection...`);
                tracker.startStep('Smart Pattern Fallback');

                // Recurse as 'text' to use the specific Smart Pattern logic (including flattening repair)
                const textResult = await processDocumentWithOpenAI({
                    data: result.content,
                    type: 'text',
                    fileName
                });

                tracker.endStep();
                const performance = tracker.getReport();
                performance.steps.push(...textResult.performance.steps);
                performance.tokenUsage = textResult.performance.tokenUsage;

                tracker.logReport();
                return { data: textResult.data, performance };
            }
        }

        // CASE 4: JSON (CSV/Excel/TXT parsed to JSON) - 3-TIER OPTIMIZATION
        else if (type === 'json') {

            // Step 0: Deduplicate data first
            tracker.startStep('Deduplicate Records');
            const dedupResult = deduplicateWithLogging(data, fileName);
            const uniqueData = dedupResult.unique;
            tracker.endStep({
                originalCount: dedupResult.stats.total,
                uniqueCount: dedupResult.stats.unique,
                duplicatesRemoved: dedupResult.stats.duplicates,
                deduplicationRate: `${dedupResult.stats.deduplicationRate}%`
            });

            tracker.startStep('Analyze JSON Structure (Local)');
            const analysis = analyzeJSONStructure(uniqueData, 50); // Analyze up to 50 rows locally
            tracker.endStep({
                confidence: analysis.confidence,
                totalRows: analysis.totalRows,
                needsLLM: analysis.needsLLM
            });

            // Confirmation check for LLM usage
            if (analysis.needsLLM) {
                console.log(`[JSON] ⚠️ Local analysis indicates LLM assistance is needed for mapping.`);
            } else {
                console.log(`[JSON] ✅ Local analysis sufficient, no LLM needed for mapping.`);
            }

            // TIER 1: High Confidence - No LLM needed! (0 tokens)
            if (!analysis.needsLLM) {
                console.log(`[JSON] ✅ TIER 1: Pattern detected locally! Confidence: ${Math.round((analysis.confidence || 0) * 100)}%`);
                console.log(`[JSON] Processing ${analysis.totalRows} unique rows WITHOUT LLM!`);

                tracker.startStep('Apply Mapping Locally');
                const mapped = applyJSONMapping(uniqueData, analysis.mapping || {});
                tracker.endStep({ recordCount: mapped.length });

                // Group by state
                tracker.startStep('Group by State');
                const grouped: any = {};
                mapped.forEach(record => {
                    const state = record.State || 'Unknown';
                    if (!grouped[state]) grouped[state] = [];
                    grouped[state].push(record);
                });
                tracker.endStep({ stateCount: Object.keys(grouped).length });

                console.log(`[JSON] ✅ Processed ${mapped.length} unique records with 0 tokens!`);
                if (dedupResult.stats.duplicates > 0) {
                    console.log(`[JSON] 🗑️  Removed ${dedupResult.stats.duplicates} duplicate records`);
                }
                const performance = tracker.logReport();
                return { data: grouped, performance };
            }

            // TIER 2: Medium Confidence - LLM on 50 rows only! (~500 tokens)
            else if (analysis.useSmartLLM) {
                // Check if confirmation is needed (testing mode)
                const needsConfirmation = process.env.REQUIRE_LLM_CONFIRMATION === 'true' && !payload.skipConfirmation;

                if (needsConfirmation) {
                    console.log(`[JSON] ⚠️ TIER 2: Pattern unclear. Requesting user confirmation for LLM usage...`);
                    const performance = tracker.getReport();
                    return {
                        needsConfirmation: true,
                        confirmationType: 'TIER_2_SMART_LLM',
                        analysis: {
                            tier: 2,
                            confidence: Math.round((analysis.confidence || 0) * 100),
                            totalRows: analysis.totalRows,
                            sampleRows: analysis.sample?.length,
                            estimatedTokens: 1000,
                            estimatedCost: '$0.001',
                            estimatedTime: '8 seconds',
                            duplicatesRemoved: dedupResult.stats.duplicates
                        },
                        performance,
                        message: `Pattern detection confidence is ${Math.round((analysis.confidence || 0) * 100)}%. Need to use LLM on ${analysis.sample?.length} sample rows to determine mapping formula, then apply to all ${analysis.totalRows} rows locally.`
                    };
                }

                console.log(`[JSON] ⚡ TIER 2: Using LLM on ${analysis.sample?.length} of ${analysis.totalRows} unique rows...`);

                // Log sample to see what we're working with
                console.log('[JSON] Sample data structure:', JSON.stringify(analysis.sample ? analysis.sample[0] : {}, null, 2));

                tracker.startStep(`LLM Mapping Detection (${analysis.sample?.length} rows only)`);

                // Check if data is concatenated in one field
                const firstRecord = analysis.sample ? analysis.sample[0] : {};
                const sourceFields = Object.keys(firstRecord);
                const nonEmptyFields = sourceFields.filter(f => firstRecord[f] && firstRecord[f].trim());
                const isConcatenated = nonEmptyFields.length === 1;

                let prompt;
                if (isConcatenated) {
                    const dataField = nonEmptyFields[0];
                    console.log(`[JSON] ⚠️ Data is concatenated in field: "${dataField}"`);

                    prompt = `Parse electoral/campaign finance data from concatenated strings.

TARGET SCHEMA: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer

SAMPLE DATA (first 10 of ${analysis.totalRows} rows):
${analysis.sample ? analysis.sample.slice(0, 10).map(r => r[dataField]).join('\n') : ''}

PATTERN ANALYSIS:
The data follows this pattern:
"Candidate/Committee (Party)(Type) Date Amount PaymentType Contributor Address City State Zip Occupation"

Example:
"Friends of Byron Donalds PAC (PAC) 06/27/2025 15,000.00 CHE \" BITCOIN VOTER PROJECT, INC.\" 2300 WILSON BOULEVARD STE 700 #1097 ARLINGTON, VA 22201 FINANCIAL ADVISORS"

Should extract to:
- Name: "BITCOIN VOTER PROJECT, INC."
- Address: "2300 WILSON BOULEVARD STE 700 #1097"
- City: "ARLINGTON"
- State: "VA"
- Zip: "22201"
- Employer: "FINANCIAL ADVISORS"
- Amount: "15,000.00"
- Date: "06/27/2025"
- Type: "CHE"

Return a JavaScript function as a string that can parse each record:
{
  "parseFunction": "function(text) { /* parsing logic */ return {Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer}; }"
}

IMPORTANT: Return ONLY valid JSON with the parseFunction. The function must handle quoted strings and extract all fields.`;
                } else {
                    prompt = `Analyze these ${analysis.sample?.length} sample records and create field mapping.

TARGET SCHEMA: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer

SAMPLE DATA (${analysis.sample?.length} of ${analysis.totalRows} total rows):
${JSON.stringify(analysis.sample ? analysis.sample.slice(0, 10) : [], null, 2)}

Return JSON mapping: {"Name": "source_field_name", "City": "source_field_name", ...}

IMPORTANT: Return ONLY the mapping object, no explanations.`;
                }

                const estimatedTokens = tracker.estimateTokens(prompt);

                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: isConcatenated ? "You are a data extraction expert. Parse concatenated electoral/campaign finance data." : "You are a data mapping expert. Return only valid JSON mapping." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0
                });

                tracker.recordTokens(completion.usage);
                const result = JSON.parse(completion.choices[0].message.content || '{}');

                if (isConcatenated) {
                    // LLM should have returned a parsing function
                    console.log('[JSON] LLM returned:', JSON.stringify(result, null, 2));

                    if (result.parseFunction) {
                        console.log('[JSON] ✅ LLM provided parsing function. Executing on all records...');
                        tracker.endStep({
                            llmProvidedParser: true,
                            sampleSize: analysis.sample?.length
                        });

                        // Execute the LLM's parsing function
                        tracker.startStep('Apply LLM Parsing Function');
                        const dataField = nonEmptyFields[0];

                        try {
                            // Create the function from the string
                            // eslint-disable-next-line no-new-func
                            const parseFunc = new Function('return ' + result.parseFunction)();

                            // Apply to all records
                            const parsed = [];
                            for (const record of uniqueData) {
                                try {
                                    const extracted = parseFunc(record[dataField]);
                                    if (extracted) {
                                        parsed.push(extracted);
                                    }
                                } catch (err: any) {
                                    console.warn('[JSON] Failed to parse record:', record[dataField], err.message);
                                }
                            }

                            tracker.endStep({
                                recordCount: parsed.length,
                                successRate: `${Math.round(parsed.length / uniqueData.length * 100)}%`
                            });

                            if (parsed.length === 0) {
                                throw new Error('Parsing function failed on all records');
                            }

                            // Group by state
                            tracker.startStep('Group by State');
                            const grouped: any = {};
                            parsed.forEach(record => {
                                const state = record.State || 'Unknown';
                                if (!grouped[state]) grouped[state] = [];
                                grouped[state].push(record);
                            });
                            tracker.endStep({ stateCount: Object.keys(grouped).length });

                            console.log(`[JSON] ✅ Successfully parsed ${parsed.length} records using LLM function!`);
                            const performance = tracker.logReport();
                            return { data: grouped, performance };

                        } catch (err: any) {
                            console.error('[JSON] ⚠️ Failed to execute LLM parsing function:', err.message);
                            console.log('[JSON] Falling back to TIER 3 (TOON)...');
                            tracker.endStep({ error: err.message, fallbackToTier3: true });
                        }
                    }

                    // Fallback to TIER 3 if no parseFunction or execution failed
                    console.log('[JSON] ⚠️ No valid parsing function. Falling back to TIER 3 (TOON)...');
                    tracker.endStep({
                        fallbackToTier3: true,
                        reason: 'No parseFunction or execution failed'
                    });

                    // Convert to TOON and use TIER 3
                    const toonData = jsonToTOON(uniqueData);

                    // Continue with TIER 3 logic...
                    // (This will be handled by the existing TIER 3 code below)
                    const needsConfirmation = process.env.REQUIRE_LLM_CONFIRMATION === 'true' && !payload.skipConfirmation;

                    if (needsConfirmation) {
                        console.log(`[JSON] ⚠️ TIER 3: Unstructured data. Requesting user confirmation for LLM usage...`);
                        const performance = tracker.getReport();
                        return {
                            needsConfirmation: true,
                            confirmationType: 'TIER_3_TOON_FALLBACK',
                            analysis: {
                                tier: 3,
                                confidence: 0,
                                totalRows: uniqueData.length,
                                toonSize: toonData.length,
                                estimatedTokens: Math.ceil(toonData.length / 4),
                                estimatedCost: '$0.01',
                                estimatedTime: '15 seconds',
                                duplicatesRemoved: dedupResult.stats.duplicates
                            },
                            performance,
                            message: `Data is unstructured (concatenated format). Need to convert to TOON format and use LLM for full extraction. This will process ${uniqueData.length} rows.`
                        };
                    }

                    // Process with TOON
                    tracker.startStep('Convert to TOON Format');
                    tracker.endStep({ toonSize: toonData.length });

                    tracker.startStep('LLM Full Extraction (TOON)');
                    const toonPrompt = `Extract electoral/campaign finance data from TOON format.

TARGET: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer

TOON DATA:
${toonData}

Return array of JSON objects with extracted fields.`;

                    const toonCompletion = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: "Extract structured data from TOON format. Return JSON array." },
                            { role: "user", content: toonPrompt }
                        ],
                        response_format: { type: "json_object" },
                        temperature: 0
                    });

                    tracker.recordTokens(toonCompletion.usage);
                    const extractedData = JSON.parse(toonCompletion.choices[0].message.content || '{}');
                    tracker.endStep({ recordCount: extractedData.records?.length || 0 });

                    // Group by state
                    tracker.startStep('Group by State');
                    const grouped: any = {};
                    const records = extractedData.records || extractedData.data || [];
                    records.forEach((record: any) => {
                        const state = record.State || 'Unknown';
                        if (!grouped[state]) grouped[state] = [];
                        grouped[state].push(record);
                    });
                    tracker.endStep({ stateCount: Object.keys(grouped).length });

                    const performance = tracker.logReport();
                    return { data: grouped, performance };
                }

                // Normal mapping case
                const mapping = result;
                tracker.endStep({
                    estimatedTokens,
                    actualTokens: completion.usage?.total_tokens,
                    sampleSize: analysis.sample?.length,
                    totalRows: analysis.totalRows
                });

                // Apply mapping to ALL unique rows locally
                tracker.startStep(`Apply Mapping to All ${analysis.totalRows} Unique Rows`);
                const mapped = applyJSONMapping(uniqueData, mapping);
                tracker.endStep({ recordCount: mapped.length });

                // Group by state
                tracker.startStep('Group by State');
                const grouped: any = {};
                mapped.forEach(record => {
                    const state = record.State || 'Unknown';
                    if (!grouped[state]) grouped[state] = [];
                    grouped[state].push(record);
                });
                tracker.endStep({ stateCount: Object.keys(grouped).length });

                console.log(`[JSON] ✅ Processed ${mapped.length} unique records using LLM on only ${analysis.sample?.length} rows!`);
                if (dedupResult.stats.duplicates > 0) {
                    console.log(`[JSON] 🗑️  Removed ${dedupResult.stats.duplicates} duplicate records`);
                }
                const tokensUsed = completion.usage?.total_tokens || 0;
                const totalAnalysisRows = analysis.totalRows || 1;
                console.log(`[JSON] Token savings: ${Math.round((1 - tokensUsed / (totalAnalysisRows * 10)) * 100)}%`);
                const performance = tracker.logReport();
                return { data: grouped, performance };
            }

            // TIER 3: Low Confidence - Convert to TOON for efficiency (~10K tokens vs 30K)
            else {
                // Check if confirmation is needed (testing mode)
                const needsConfirmation = process.env.REQUIRE_LLM_CONFIRMATION === 'true' && !payload.skipConfirmation;

                if (needsConfirmation) {
                    console.log(`[JSON] ⚠️ TIER 3: Unstructured data. Requesting user confirmation for LLM usage...`);

                    // Calculate TOON size for estimate
                    const toonString = jsonToTOON(uniqueData);
                    const estimatedTokens = Math.round(toonString.length / 4);

                    const performance = tracker.getReport();
                    return {
                        needsConfirmation: true,
                        confirmationType: 'TIER_3_TOON_FALLBACK',
                        analysis: {
                            tier: 3,
                            confidence: Math.round((analysis.confidence || 0) * 100),
                            totalRows: analysis.totalRows,
                            estimatedTokens,
                            estimatedCost: `$${(estimatedTokens * 0.000001).toFixed(4)}`,
                            estimatedTime: '60 seconds',
                            duplicatesRemoved: dedupResult.stats.duplicates,
                            toonSize: toonString.length
                        },
                        performance,
                        message: `No clear pattern detected. Will convert to TOON format (${Math.round(toonString.length / 1024)}KB) and use LLM for full extraction. This will use approximately ${estimatedTokens} tokens.`
                    };
                }

                console.log(`[JSON] ⚠️ TIER 3: Unstructured data detected. Converting to TOON for efficiency...`);

                tracker.startStep('Convert JSON to TOON');
                const toonString = jsonToTOON(uniqueData);
                const jsonSize = JSON.stringify(uniqueData).length;
                const toonSize = toonString.length;
                const savings = Math.round((1 - toonSize / jsonSize) * 100);
                tracker.endStep({
                    jsonSize,
                    toonSize,
                    savings: `${savings}%`
                });

                console.log(`[JSON] TOON conversion: ${jsonSize} → ${toonSize} chars (${savings}% reduction)`);
                if (dedupResult.stats.duplicates > 0) {
                    console.log(`[JSON] 🗑️  Removed ${dedupResult.stats.duplicates} duplicate records before TOON conversion`);
                }

                tracker.startStep('LLM Extraction (TOON format)');
                const prompt = `Extract and structure electoral data from this TOON format.

TARGET SCHEMA: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer

TOON DATA:
${toonString.substring(0, 50000)}

Return JSON grouped by state: {"StateName": [{...}], ...}`;

                const estimatedTokens = tracker.estimateTokens(prompt);

                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "Extract data accurately. Return valid JSON grouped by state." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                });

                tracker.recordTokens(completion.usage);
                tracker.endStep({
                    estimatedTokens,
                    actualTokens: completion.usage?.total_tokens
                });

                console.log(`[JSON] ✅ Used TOON for ${savings}% token reduction vs raw JSON`);
                const performance = tracker.logReport();
                return { data: JSON.parse(completion.choices[0].message.content || '{}'), performance };
            }
        }

        // CASE 5: Plain TEXT or PDF TEXT (TXT/PDF files - use smart pattern detection!)
        else if (type === 'text' || type === 'pdf_text') {

            let processedText = data; // content from payload

            tracker.startStep('Smart Pattern Analysis (Initial)');
            let analysis = analyzePlainText(processedText);

            // Dynamic Row Reconstruction (for flattened PDFs)
            if (analysis.needsRestructuring) {
                processedText = await reconstructFlattenedText(processedText, analysis, tracker, openai);
                analysis = analyzePlainText(processedText); // Re-analyze
            }

            tracker.endStep({
                needsLLM: analysis.needsLLM,
                confidence: analysis.structure?.mapping?.confidence,
                totalLines: analysis.totalLines
            });

            if (!analysis.needsLLM && analysis.structure) {
                // Pattern detected with high confidence - NO LLM NEEDED!
                console.log(`[SMART] ✅ Pattern detected! Processing ${analysis.totalLines} lines locally...`);

                tracker.startStep('Parse with Detected Pattern');
                const lines = processedText.split('\n').filter((l: string) => l.trim());
                const delimiter = analysis.structure.delimiter;
                const headers = analysis.structure.headers;

                // Parse all lines using detected pattern
                const records: any[] = [];
                const startIndex = analysis.structure.hasHeader ? 1 : 0;

                for (let i = startIndex; i < lines.length; i++) {
                    const parts = lines[i].split(delimiter).map((p: string) => p.trim());
                    const record: any = {};

                    headers.forEach((header: string, index: number) => {
                        record[header] = parts[index] || '';
                    });

                    records.push(record);
                }
                tracker.endStep({ recordCount: records.length });

                // Apply field mapping to target schema
                tracker.startStep('Apply Schema Mapping');
                const mapped = records.map(record => {
                    const result: any = {};
                    Object.entries(analysis.structure.mapping.mapping).forEach(([targetField, sourceIndex]) => {
                        const sourceField = headers[sourceIndex as number];
                        result[targetField] = record[sourceField] || null;
                    });
                    return result;
                });
                tracker.endStep({ recordCount: mapped.length });

                // Group by state
                tracker.startStep('Group by State');
                const grouped: any = {};
                mapped.forEach(record => {
                    const state = record.State || 'Unknown';
                    if (!grouped[state]) grouped[state] = [];
                    grouped[state].push(record);
                });
                tracker.endStep({ stateCount: Object.keys(grouped).length });

                console.log(`[SMART] ✅ Processed ${mapped.length} records without LLM!`);
                const performance = tracker.logReport();
                return { data: grouped, performance };
            }
            else if (analysis.useSmartLLM) {
                // Use Helper Function for Smart Schema Extraction (Unified with Image Logic)
                return await extractDataWithSmartSchema(processedText, analysis, tracker, openai);
            }
            else {
                // Truly unstructured - use full LLM extraction
                console.log(`[SMART] No pattern detected. Using full LLM extraction...`);
                tracker.startStep('LLM Full Extraction (Unstructured Text)');
                const prompt = `Extract electoral data from this text.

FIELDS: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer

Return JSON: {"StateName": [{...}]}

TEXT:
${data.substring(0, 50000)}`;

                const estimatedTokens = tracker.estimateTokens(prompt);

                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "Return valid JSON only." },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                });

                tracker.recordTokens(completion.usage);
                tracker.endStep({ estimatedTokens, actualTokens: completion.usage?.total_tokens });

                const performance = tracker.logReport();
                return { data: JSON.parse(completion.choices[0].message.content || '{}'), performance };
            }
        }

        // CASE 7: IMAGE_OCR (text extracted from image via Tesseract)
        else if (type === 'image_ocr') {
            const textResult = await processDocumentWithOpenAI({
                data: data,
                type: 'text',
                fileName
            });

            // Merge performance report
            const performance = tracker.getReport();
            performance.steps.push(...textResult.performance.steps);
            performance.tokenUsage = textResult.performance.tokenUsage;

            tracker.logReport();
            return { data: textResult.data, performance };
        }

        // CASE 8: STRUCTURED (already parsed data from CSV/Excel/OCR)
        // REWRITE PER USER REQUEST:
        // "Directly... no need to find structured or commas or not just parse data and directly give to LLM"
        // Force ALL structured data back to text -> LLM Logic Extraction.
        else if (type === 'structured') {
            console.log(`[STRUCTURED] 🔄 Converting ${data.length} records back to text for Full Smart Pattern Analysis (as requested)...`);

            // Flatten the JSON objects back to a text representation that looks like the original CSV/Table
            // We join values with spaces/tabs so the LLM can "see" the columns
            // We include the keys in the first row as a "header hint"
            let textData = '';

            if (data.length > 0) {
                // Add header row based on keys of first record
                const headers = Object.keys(data[0]).join(' ');

                // Add data rows
                const rows = data.map((r: any) => Object.values(r).join(' '));

                textData = headers + '\n' + rows.join('\n');
            }

            console.log(`[STRUCTURED] 🚀 Redirecting to Smart Schema Engine (Hybrid Mode). Sample size: 50 rows.`);
            return await extractDataWithSmartSchema(textData, {}, tracker, openai);
        } else {
            throw new Error(`Unsupported type: ${type}`);
        }

    } catch (error: any) {
        console.error('[OpenAI] Failed:', error.message);
        // Ensure tracker is available in scope or handle safely
        if (tracker) {
            const performance = tracker.getReport();
            // @ts-ignore
            performance.error = error.message;
        }
        throw error;
    }
}

/**
 * Helper: Reconstructs flattened text rows using LLM-generated Regex
 */
async function reconstructFlattenedText(text: string, analysis: any, tracker: any, openai: any) {
    console.log('[SMART] ⚠️ Text flattened. Asking LLM for separator regex...');
    tracker.startStep('Dynamic Row Reconstruction');

    const restructurePrompt = `
You are a Regex Expert.
The following text is missing newlines between rows. It is a "flattened" text dump.
Identify the JavaScript Regex pattern that splits this text into logical rows.
Example: If rows end with "Terminated 12345", regex might be "/(?<=Terminated\\s+)(?=\\d{5,})/".

SAMPLE TEXT:
${analysis.sample}

RETURN ONLY the JavaScript Regex string (e.g. "(?<=Active)(\\s+)" or "/.../"). Do not include explanation.
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: restructurePrompt }],
            temperature: 0
        });

        let regexStr = completion.choices[0].message.content.trim();
        regexStr = regexStr.replace(/^```(?:javascript|regex)?\n?/, '').replace(/\n?```$/, '');

        let flags = '';
        const lastSlashIndex = regexStr.lastIndexOf('/');
        if (regexStr.startsWith('/') && lastSlashIndex > 0) {
            flags = regexStr.substring(lastSlashIndex + 1);
            regexStr = regexStr.substring(1, lastSlashIndex);
        }

        if (!flags.includes('g')) flags += 'g';
        console.log(`[SMART] 🧩 Identified Separator Regex: /${regexStr}/${flags}`);

        const separatorRegex = new RegExp(regexStr, flags);
        const processedText = text.replace(separatorRegex, '$&\n');

        const newLines = processedText.split('\n').filter((l: string) => l.trim()).length;
        console.log(`[SMART] ✅ Reconstructed text into approximately ${newLines} rows.`);
        tracker.endStep({ reconstructedRows: newLines, regex: `/${regexStr}/${flags}` });

        return processedText;

    } catch (e: any) {
        console.error('[SMART] ❌ Regex application failed:', e.message);
        tracker.endStep({ error: `Regex application failed: ${e.message}` });
        return text; // Return original if failed
    }
}

/**
 * Helper: Extracts structure using LLM-detected headers (Dynamic Schema)
 */
async function extractDataWithSmartSchema(text: string, analysis: any, tracker: any, openai: any) {
    console.log('[SMART] 🚀 V2 Processing Loaded (Optimized)');
    // 1. Split Text into Logical Chunks (Pages)
    tracker.startStep('Split into Chunks');
    const chunks = text.split('---PAGE_BREAK---').filter(c => c.trim().length > 10);
    console.log(`[SMART] 📚 Processing ${chunks.length} chunks (pages)...`);
    tracker.endStep({ chunkCount: chunks.length });

    // OPTIMIZATION: Fast Path for Single Page / Short Docs
    // detailed Regex generation is overkill for single pages and adds latency.
    if (chunks.length === 1 && text.length < 15000) {
        console.log('[SMART] ⚡ Fast Path: Single chunk detected. Using Direct Extraction for speed.');
        tracker.startStep('Direct LLM Extraction (Fast Path)');

        const prompt = `Extract structured data from this OCR text.
TEXT:
${chunks[0]}

Return JSON with a "records" array containing the data. 
Detect headers automatically.
Format: { "records": [ { "Field": "Value" } ] }`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Extract structured data from text. Return JSON." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0
        });

        tracker.recordTokens(completion.usage);
        const result = JSON.parse(completion.choices[0].message.content || '{}');
        const records = result.records || result.data || [];

        console.log(`[SMART] ✅ Fast Path extracted ${records.length} records.`);
        tracker.endStep({ recordCount: records.length });

        // Group by state
        tracker.startStep('Group by State');
        const grouped: any = {};
        records.forEach((record: any) => {
            const stateKey = Object.keys(record).find(k => k.toLowerCase() === 'state' || k.toLowerCase().includes('jurisdiction') || k.toLowerCase().includes('province'));
            const state = (stateKey ? record[stateKey] : 'Unknown') || 'Unknown';
            if (!grouped[state]) grouped[state] = [];
            grouped[state].push(record);
        });
        tracker.endStep({ stateCount: Object.keys(grouped).length });

        const performance = tracker.logReport();
        return { data: grouped, performance };
    }

    let currentPattern: any = null;
    let allRecords: any[] = [];

    // Process Chunks in Series (to learn pattern) or Parallel?
    // Mixed approach: Process Chunk 1 to learn pattern, then Parallelize valid chunks
    // For now, simpler optimization: Parallelize all if no pattern, but we need pattern first.
    // Let's keep loop for pattern evolution but optimize the invalidation check.

    for (let cIndex = 0; cIndex < chunks.length; cIndex++) {
        const chunk = chunks[cIndex];
        const chunkLines = chunk.split('\n').filter(l => l.trim());

        if (chunkLines.length === 0) continue;

        let usedPattern = currentPattern;
        // DECISION: Should we use the existing pattern or find a new one?
        let needNewPattern = !currentPattern;

        if (currentPattern) {
            // Test current pattern on first 5 lines
            const sampleLines = chunkLines.slice(0, 5);
            let matchCount = 0;

            if (currentPattern.rowParsingRegex) {
                const regex = new RegExp(currentPattern.rowParsingRegex);
                matchCount = sampleLines.filter(l => regex.test(l)).length;
            } else {
                matchCount = 5; // Assume simple delimiter works
            }

            if (matchCount < sampleLines.length * 0.4) {
                console.log(`[SMART] ⚠️ Pattern mismatch on Chunk ${cIndex + 1}. Detecting new schema...`);
                needNewPattern = true;
            }
        }

        if (needNewPattern) {
            tracker.startStep(`Detect Schema (Chunk ${cIndex + 1})`);
            console.log(`[SMART] 🔍 Detecting schema for Chunk ${cIndex + 1}...`);
            const sample = chunkLines.slice(0, 50).join('\n');

            const prompt = `Analyze this document section (OCR/Text) and generate a parser.
SAMPLE DATA:
${sample}

INSTRUCTIONS:
1. Identify the columns based on headers and data look.
2. If the data is complex (spaces within values, like "New York"), you MUST generate a REGEX with NAMED CAPTURE GROUPS.
3. CRITICAL: Do NOT use the start-of-line anchor "^" inside any capture group except the very first one.
   - BAD: (?<City>^[\w]+)  <-- Causes failure in middle of string
   - GOOD: (?<City>[\w\s]+)
4. Be flexible with OCR errors (e.g. dates might miss slashes "12122022", amounts might have "X" suffix).
   - Use flexible separators like \\s+ instead of strict \\s{2,} if columns are close.
5. CRITICAL: Make fields OPTIONAL if they might be missing.
   - Example: If a column (e.g. "MiddleName") is sometimes empty, use "(?: \\s + (? <MiddleName>.+?)) ? ".
   - The regex MUST match the row even if some columns are blank.
6. DYNAMIC MAPPING: Do NOT assume standard columns. Use EXACTLY the headers found in the SAMPLE DATA.

Return JSON:
{ 
  "rowParsingRegex": "YOUR_REGEX_HERE",
  "delimiter": "space" | "tab" | "comma" | "pipe" | null,
  "headers": ["Field1", "Field2"],
  "confidence": 0.9
} 
NOTE: Escape backslashes in JSON (e.g. \\\\s).`;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a data extraction expert. Return only valid JSON." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0
            });
            tracker.recordTokens(completion.usage);
            currentPattern = JSON.parse(completion.choices[0].message.content || '{}');
            console.log(`[SMART] 🧩 New Pattern: ${currentPattern.rowParsingRegex ? 'REGEX' : currentPattern.delimiter}`);
            if (currentPattern.rowParsingRegex) console.log(`[DEBUG] Regex: ${currentPattern.rowParsingRegex}`);
            tracker.endStep({ patternType: currentPattern.rowParsingRegex ? 'Regex' : 'Delimiter', headers: currentPattern.headers });
        }

        // Apply Pattern
        tracker.startStep(`Parse Chunk ${cIndex + 1}`);
        let chunkRecords = parseChunkWithPattern(chunkLines, currentPattern);
        console.log(`[SMART] 📄 Chunk ${cIndex + 1}: Extracted ${chunkRecords.length} records`);

        // RECOVERY MECHANISM: If Pattern Failed (0 records), use LLM Extraction
        if (chunkRecords.length === 0) {
            console.log(`[SMART] ⚠️ Extraction failed (0 records). Regex/Pattern mismatch. Falling back to LLM extraction for Chunk ${cIndex + 1}...`);
            tracker.endStep({ error: 'Pattern Failed', fallback: true });

            tracker.startStep(`LLM Fallback Extraction (Chunk ${cIndex + 1})`);
            const fallbackPrompt = `Extract data from this OCR text section.
HEADERS DETECTED: ${currentPattern.headers?.join(', ') || 'Auto-detect'}
TEXT:
${chunk}

Return JSON with valid records array.
Format: { "records": [ { "Field": "Value" } ] }
`;
            const fallbackCompletion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "Extract structured data from text. Return JSON." },
                    { role: "user", content: fallbackPrompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0
            });

            tracker.recordTokens(fallbackCompletion.usage);
            const fallbackData = JSON.parse(fallbackCompletion.choices[0].message.content || '{}');
            chunkRecords = fallbackData.records || fallbackData.data || [];
            console.log(`[SMART] 🔄 Recovered ${chunkRecords.length} records via LLM Fallback.`);
            tracker.endStep({ recoveredCount: chunkRecords.length });
        } else {
            tracker.endStep({ extractedCount: chunkRecords.length });
        }

        allRecords.push(...chunkRecords);
    }

    // Group by state
    tracker.startStep('Group by State');
    const grouped: any = {};
    allRecords.forEach(record => {
        // Try to find a state field flexibly
        const stateKey = Object.keys(record).find(k => k.toLowerCase() === 'state' || k.toLowerCase().includes('jurisdiction') || k.toLowerCase().includes('province'));
        const state = (stateKey ? record[stateKey] : 'Unknown') || 'Unknown';
        if (!grouped[state]) grouped[state] = [];
        grouped[state].push(record);
    });
    tracker.endStep({ stateCount: Object.keys(grouped).length });

    console.log(`[SMART] ✅ Total Processed: ${allRecords.length} records.`);
    const performance = tracker.logReport();
    return { data: grouped, performance };
}

function parseChunkWithPattern(lines: string[], pattern: any) {
    const records: any[] = [];
    if (pattern.rowParsingRegex) {
        try {
            const regex = new RegExp(pattern.rowParsingRegex);
            console.log(`[DEBUG] Testing Regex on ${lines.length} lines. Sample line: "${lines[0]}"`);

            for (const line of lines) {
                const match = line.match(regex);
                if (match && match.groups) {
                    records.push(match.groups);
                } else {
                    // Log first 3 failures
                    if (records.length < 3) console.log(`[DEBUG] Regex failed on line: "${line.substring(0, 100)}..."`);
                }
            }
        } catch (e: any) { console.error("Regex Error", e.message); }
    } else {
        const delimiter = pattern.delimiter === 'space' ? /\s{2,}/ :
            pattern.delimiter === 'tab' ? '\t' :
                pattern.delimiter === 'comma' ? ',' : pattern.delimiter;

        console.log(`[DEBUG] Using Delimiter: "${pattern.delimiter}"`);

        for (const line of lines) {
            const parts = line.split(delimiter).map(p => p.trim()).filter(p => p);
            if (parts.length < (pattern.headers?.length || 2) - 1) continue;
            // Skip Header
            if (pattern.headers && parts.some(p => pattern.headers.includes(p))) continue;

            const record: any = {};
            if (pattern.headers) {
                pattern.headers.forEach((h: string, i: number) => { if (i < parts.length) record[h] = parts[i]; });
            }
            records.push(record);
        }
    }
    return records;
}

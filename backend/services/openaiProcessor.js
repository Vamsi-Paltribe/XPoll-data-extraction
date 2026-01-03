const OpenAI = require('openai');
const { parseToon, extractToonSample } = require('../utils/toonParser');
const { processPDFToToon } = require('../utils/pdfTableExtractor');
const { processImageToToon } = require('../utils/imageOCR');
const PerformanceTracker = require('../utils/performanceTracker');

/**
 * Process document using TOON format optimization
 * LLM is ONLY used for schema mapping, NOT for data extraction
 * Returns: { data, performance }
 */
async function processDocumentWithOpenAI(payload) {
    const { data, type, fileName } = payload;
    const tracker = new PerformanceTracker(fileName, type);

    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // CASE 1: TOON FORMAT (CSV/Excel/TXT - already structured)
        if (type === 'toon') {
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
            const mapping = JSON.parse(mappingResult.choices[0].message.content);
            tracker.endStep({ estimatedTokens, actualTokens: mappingResult.usage?.total_tokens });

            // Apply mapping locally (no LLM!)
            tracker.startStep('Parse Full TOON');
            const fullData = parseToon(data);
            tracker.endStep({ recordCount: fullData.length });

            tracker.startStep('Apply Mapping Locally');
            const mapped = fullData.map(row => {
                const result = {};
                Object.entries(mapping).forEach(([target, source]) => {
                    result[target] = row[source] || null;
                });
                return result;
            });
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

            const performance = tracker.logReport();
            return { data: grouped, performance };
        }

        // CASE 2: PDF (extract tables without LLM!)
        else if (type === 'pdf') {
            tracker.startStep('Decode PDF Buffer');
            const pdfBuffer = Buffer.from(data, 'base64');
            tracker.endStep({ bufferSize: pdfBuffer.length });

            tracker.startStep('Extract Tables from PDF');
            const result = await processPDFToToon(pdfBuffer);
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
                // No table, use LLM for unstructured text
                tracker.startStep('LLM Full Extraction (No Table)');
                const prompt = `Extract electoral data from this text.

FIELDS: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer

Return JSON: {"StateName": [{...}]}

TEXT:
${result.content.substring(0, 50000)}`;

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
                return { data: JSON.parse(completion.choices[0].message.content), performance };
            }
        }

        // CASE 3: IMAGE (OCR without LLM!)
        else if (type === 'image') {
            tracker.startStep('Decode Image Buffer');
            const imageBuffer = Buffer.from(data, 'base64');
            tracker.endStep({ bufferSize: imageBuffer.length });

            tracker.startStep('OCR Text Extraction');
            const result = await processImageToToon(imageBuffer);
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
            const { analyzeJSONStructure, applyJSONMapping, jsonToTOON } = require('../utils/jsonAnalyzer');
            const { deduplicateWithLogging } = require('../utils/deduplicator');

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
                console.log(`[JSON] ✅ TIER 1: Pattern detected locally! Confidence: ${Math.round(analysis.confidence * 100)}%`);
                console.log(`[JSON] Processing ${analysis.totalRows} unique rows WITHOUT LLM!`);

                tracker.startStep('Apply Mapping Locally');
                const mapped = applyJSONMapping(uniqueData, analysis.mapping);
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
                            confidence: Math.round(analysis.confidence * 100),
                            totalRows: analysis.totalRows,
                            sampleRows: analysis.sample.length,
                            estimatedTokens: 1000,
                            estimatedCost: '$0.001',
                            estimatedTime: '8 seconds',
                            duplicatesRemoved: dedupResult.stats.duplicates
                        },
                        performance,
                        message: `Pattern detection confidence is ${Math.round(analysis.confidence * 100)}%. Need to use LLM on ${analysis.sample.length} sample rows to determine mapping formula, then apply to all ${analysis.totalRows} rows locally.`
                    };
                }

                console.log(`[JSON] ⚡ TIER 2: Using LLM on ${analysis.sample.length} of ${analysis.totalRows} unique rows...`);

                // Log sample to see what we're working with
                console.log('[JSON] Sample data structure:', JSON.stringify(analysis.sample[0], null, 2));

                tracker.startStep(`LLM Mapping Detection (${analysis.sample.length} rows only)`);

                // Check if data is concatenated in one field
                const firstRecord = analysis.sample[0];
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
${analysis.sample.slice(0, 10).map(r => r[dataField]).join('\n')}

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
                    prompt = `Analyze these ${analysis.sample.length} sample records and create field mapping.

TARGET SCHEMA: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer

SAMPLE DATA (${analysis.sample.length} of ${analysis.totalRows} total rows):
${JSON.stringify(analysis.sample.slice(0, 10), null, 2)}

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
                const result = JSON.parse(completion.choices[0].message.content);

                if (isConcatenated) {
                    // LLM should have returned a parsing function
                    console.log('[JSON] LLM returned:', JSON.stringify(result, null, 2));

                    if (result.parseFunction) {
                        console.log('[JSON] ✅ LLM provided parsing function. Executing on all records...');
                        tracker.endStep({
                            llmProvidedParser: true,
                            sampleSize: analysis.sample.length
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
                                } catch (err) {
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
                            const grouped = {};
                            parsed.forEach(record => {
                                const state = record.State || 'Unknown';
                                if (!grouped[state]) grouped[state] = [];
                                grouped[state].push(record);
                            });
                            tracker.endStep({ stateCount: Object.keys(grouped).length });

                            console.log(`[JSON] ✅ Successfully parsed ${parsed.length} records using LLM function!`);
                            const performance = tracker.logReport();
                            return { data: grouped, performance };

                        } catch (err) {
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
                    const { jsonToTOON } = require('../utils/jsonAnalyzer');
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
                    const extractedData = JSON.parse(toonCompletion.choices[0].message.content);
                    tracker.endStep({ recordCount: extractedData.records?.length || 0 });

                    // Group by state
                    tracker.startStep('Group by State');
                    const grouped = {};
                    const records = extractedData.records || extractedData.data || [];
                    records.forEach(record => {
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
                    sampleSize: analysis.sample.length,
                    totalRows: analysis.totalRows
                });

                // Apply mapping to ALL unique rows locally
                tracker.startStep(`Apply Mapping to All ${analysis.totalRows} Unique Rows`);
                const mapped = applyJSONMapping(uniqueData, mapping);
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

                console.log(`[JSON] ✅ Processed ${mapped.length} unique records using LLM on only ${analysis.sample.length} rows!`);
                if (dedupResult.stats.duplicates > 0) {
                    console.log(`[JSON] 🗑️  Removed ${dedupResult.stats.duplicates} duplicate records`);
                }
                console.log(`[JSON] Token savings: ${Math.round((1 - completion.usage.total_tokens / (analysis.totalRows * 10)) * 100)}%`);
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
                return { data: JSON.parse(completion.choices[0].message.content), performance };
            }
        }

        // CASE 5: Plain TEXT or PDF TEXT (TXT/PDF files - use smart pattern detection!)
        else if (type === 'text' || type === 'pdf_text') {
            const { analyzePlainText } = require('../utils/smartPatternDetector');

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
                const lines = processedText.split('\n').filter(l => l.trim());
                const delimiter = analysis.structure.delimiter;
                const headers = analysis.structure.headers;

                // Parse all lines using detected pattern
                const records = [];
                const startIndex = analysis.structure.hasHeader ? 1 : 0;

                for (let i = startIndex; i < lines.length; i++) {
                    const parts = lines[i].split(delimiter).map(p => p.trim());
                    const record = {};

                    headers.forEach((header, index) => {
                        record[header] = parts[index] || '';
                    });

                    records.push(record);
                }
                tracker.endStep({ recordCount: records.length });

                // Apply field mapping to target schema
                tracker.startStep('Apply Schema Mapping');
                const mapped = records.map(record => {
                    const result = {};
                    Object.entries(analysis.structure.mapping.mapping).forEach(([targetField, sourceIndex]) => {
                        const sourceField = headers[sourceIndex];
                        result[targetField] = record[sourceField] || null;
                    });
                    return result;
                });
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
                return { data: JSON.parse(completion.choices[0].message.content), performance };
            }
        }

        // CASE 7: IMAGE_OCR (text extracted from image via Tesseract)
        else if (type === 'image_ocr') {
            console.log(`[IMAGE_OCR] 🖼️  Processing OCR text via Smart Pattern Pipeline...`);

            // Recurse as 'text' to use the specific Smart Pattern logic (including flattening repair)
            // This reuses the PDF optimization for images!
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

        // CASE 8: STRUCTURED (already parsed data from CSV/Excel/OCR - no LLM needed!)
        else if (type === 'structured') {
            console.log(`[STRUCTURED] 📊 Processing pre-parsed data (NO LLM)`);
            console.log(`[STRUCTURED] 📦 Records count: ${data.length}`);

            tracker.startStep('Group by State (No LLM)');

            // Data is already in correct format, just group by state
            const groupedData = {};

            data.forEach(record => {
                const state = record.State || record.state || 'Unknown';
                if (!groupedData[state]) {
                    groupedData[state] = [];
                }
                groupedData[state].push(record);
            });

            tracker.endStep({
                recordCount: data.length,
                stateCount: Object.keys(groupedData).length
            });

            console.log(`[STRUCTURED] ✅ Grouped ${data.length} records into ${Object.keys(groupedData).length} states`);
            console.log(`[STRUCTURED] 💰 Tokens used: 0 (no LLM!)`);

            const performance = tracker.logReport();
            return { data: groupedData, performance };
        }

        else {
            throw new Error(`Unsupported type: ${type}`);
        }

    } catch (error) {
        console.error('[OpenAI] Failed:', error.message);
        const performance = tracker.getReport();
        performance.error = error.message;
        throw error;
    }
}

/**
 * Helper: Reconstructs flattened text rows using LLM-generated Regex
 */
async function reconstructFlattenedText(text, analysis, tracker, openai) {
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

        const newLines = processedText.split('\n').filter(l => l.trim()).length;
        console.log(`[SMART] ✅ Reconstructed text into approximately ${newLines} rows.`);
        tracker.endStep({ reconstructedRows: newLines, regex: `/${regexStr}/${flags}` });

        return processedText;

    } catch (e) {
        console.error('[SMART] ❌ Regex application failed:', e.message);
        tracker.endStep({ error: `Regex application failed: ${e.message}` });
        return text; // Return original if failed
    }
}

/**
 * Helper: Extracts structure using LLM-detected headers (Dynamic Schema)
 */
async function extractDataWithSmartSchema(text, analysis, tracker, openai) {
    console.log(`[SMART] Using LLM on first ${analysis.sampleLines} lines only...`);
    tracker.startStep('LLM Pattern Detection (Sample)');

    const prompt = `Analyze this sample to detect the table structure.
SAMPLE (${analysis.sampleLines} of ${analysis.totalLines} lines):
${analysis.sample}

Return JSON with:
1. "delimiter": inferred delimiter (comma, tab, space, or pipe)
2. "headers": Array of strings representing the columns found in the text. Use exact terms found in the header row if possible.

Example: {"delimiter": "\t", "headers": ["Date", "Description", "Amount", "Balance"]}`;

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "Return only valid JSON." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0
    });

    tracker.recordTokens(completion.usage);
    const patternResult = JSON.parse(completion.choices[0].message.content);
    tracker.endStep({
        estimatedTokens: 0,
        actualTokens: completion.usage?.total_tokens,
        sampleLines: analysis.sampleLines
    });

    // Apply to ALL lines
    tracker.startStep('Apply Pattern to All Lines');
    const lines = text.split('\n').filter(l => l.trim());
    const delimiter = patternResult.delimiter === 'space' ? /\s{2,}/ :
        patternResult.delimiter === 'tab' ? '\t' : patternResult.delimiter;

    const records = [];
    for (let i = 1; i < lines.length; i++) { // Skip first header
        const parts = lines[i].split(delimiter).map(p => p.trim());

        // Smart Filter: Skip recurring headers
        const headerKeywords = patternResult.headers || [];
        const matchCount = headerKeywords.filter(k => lines[i].includes(k)).length;
        if (matchCount > 2) continue;

        const record = {};
        if (patternResult.headers) {
            patternResult.headers.forEach((header, index) => {
                if (header && index < parts.length) {
                    record[header] = parts[index];
                }
            });
        }
        records.push(record);
    }
    tracker.endStep({ recordCount: records.length });

    // Group by state
    tracker.startStep('Group by State');
    const grouped = {};
    records.forEach(record => {
        const state = record.State || 'Unknown';
        if (!grouped[state]) grouped[state] = [];
        grouped[state].push(record);
    });
    tracker.endStep({ stateCount: Object.keys(grouped).length });

    console.log(`[SMART] ✅ Processed ${records.length} records dynamically!`);
    const performance = tracker.logReport();
    return { data: grouped, performance };
}

module.exports = { processDocumentWithOpenAI };

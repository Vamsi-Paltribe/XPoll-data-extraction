import OpenAI from 'openai';
import { PROMPTS } from '../config/prompts';
import { extractMappingLogic, applyLogicToDataset, invalidateTemplate, invalidateTemplateByName, ExecutionResult } from './logicExtractor';
import { parseToon } from '../utils/toonParser';
import { processPDFToText } from '../utils/pdfTableExtractor';
import PerformanceTracker from '../utils/performanceTracker';

interface ProcessPayload {
    data: any;
    type: string;
    fileName: string;
    skipConfirmation?: boolean;
    additionalPrompt?: string;
    parameters?: any[]; // Dynamic fields to extract
}

/**
 * Unified Document Processor
 * Coordinates: Pre-processing (OCR/PDF extraction) -> Logic Extraction -> Data Application
 */
export async function processDocumentWithOpenAI(payload: ProcessPayload): Promise<any> {
    const { data, type, fileName, additionalPrompt, skipConfirmation, parameters = [] } = payload;
    const tracker = new PerformanceTracker(fileName, type);

    try {
        let processableData = data;
        let processableType = type;
        let rawPages: string[] = []; // Store pages for fallback
        let executionResult: ExecutionResult;

        // --- PHASE 1: PRE-PROCESSING (Normalize to Text/JSON) ---
        tracker.startStep('Pre-processing');

        // DOUBLE-LOCK: Check both passed type and filename extension
        const lowerName = fileName.toLowerCase();
        const isPdf = type === 'pdf' || lowerName.endsWith('.pdf');
        const isImage = type === 'image' || ['.jpg', '.jpeg', '.png', '.webp', '.bmp'].some(ext => lowerName.endsWith(ext));
        const isTxt = type === 'txt' || type === 'text' || type === 'pdf_text' || lowerName.endsWith('.txt');

        if (isPdf) {
            console.log(`[OpenAI Processor] 📄 PDF Detected (${fileName}). Forcing Scenario B...`);
            const pdfBuffer = Buffer.from(data, 'base64');
            const result = await processPDFToText(pdfBuffer);
            processableData = result.content;
            rawPages = result.pages; // Keep raw pages for fallback
            processableType = 'text';

            if (result.isRaw) {
                console.log(`[OpenAI Processor] ⚠️ Using RAW PDF stream (Layout lost, content preserved). Length: ${processableData.length}`);
            } else {
                console.log(`[OpenAI Processor] 📄 PDF Extracted (Layout Preserved). Pages: ${rawPages.length}, Total Length: ${processableData.length}`);
            }

            if (!processableData || processableData.trim().length === 0) {
                console.warn(`[OpenAI Processor] ❌ PDF text extraction yielded no content. The PDF might be scanned, encrypted, or corrupted.`);
                if (rawPages.length === 0) {
                    const errMsg = result.error ? `PDF Extraction Failed (${result.error})` : `PDF Extraction Failed: No text could be extracted.`;
                    throw new Error(`${errMsg} The document might be corrupt or an unsupported format.`);
                }
            }

            // IMMEDIATELY PROCESS PDF DIRECTLY (Scenario B)
            console.log(`[OpenAI Processor] 🐢 Processing PDF via Direct LLM (Scenario B)...`);
            if (rawPages.length > 0) {
                executionResult = await processPagesDirectly(rawPages, fileName, parameters);
            } else {
                executionResult = await processPagesDirectly([processableData], fileName, parameters);
            }

            if (!executionResult.success) {
                console.error(`[OpenAI Processor] ❌ Direct PDF Extraction Failed: ${executionResult.error}`);
                executionResult = { success: false, data: {}, allRecords: [], error: executionResult.error, performance: tracker.getReport() };
            }

            return {
                success: true,
                data: executionResult.data || {},
                allRecords: executionResult.allRecords || [],
                performance: tracker.getReport(),
                logicTier: 4,
                source: 'direct-pdf',
                error: executionResult.error
            };
        }
        else if (isImage) {
            console.log(`[OpenAI Processor] 👁️ Using Vision LLM for direct image extraction...`);
            // Determine MIME type from filename or default to image/png
            const ext = fileName.split('.').pop()?.toLowerCase();
            const mimeType = ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';

            executionResult = await processImageDirectly(data, fileName, mimeType, parameters);

            if (!executionResult.success) {
                console.error(`[OpenAI Processor] ❌ Direct Image Extraction Failed: ${executionResult.error}`);
                executionResult = { success: false, data: {}, allRecords: [], error: executionResult.error, performance: tracker.getReport() };
            }

            // Short-circuit: Return result
            return {
                success: true,
                data: executionResult.data || {},
                allRecords: executionResult.allRecords || [],
                performance: tracker.getReport(),
                logicTier: 4,
                source: 'vision-direct',
                error: executionResult.error
            };
        }
        else if (isTxt) {
            // Treat raw text files like Scenario B (Direct) to avoid pattern recognition failures
            console.log(`[OpenAI Processor] 📄 Processing ${type} directly via LLM (Scenario B)...`);
            if (!processableData || processableData.trim().length < 10) {
                throw new Error(`Extraction Failed: No readable text found in the ${type} file.`);
            }
            // For single page text, we treat it as one page
            executionResult = await processPagesDirectly([processableData], fileName, parameters);

            if (!executionResult.success) {
                throw new Error(`Direct Text Extraction Failed: ${executionResult.error}`);
            }

            return {
                success: true,
                data: executionResult.data,
                allRecords: executionResult.allRecords,
                performance: tracker.getReport(),
                logicTier: 4,
                source: 'direct-text'
            };
        }
        else if (type === 'toon') {
            if (typeof processableData === 'string' && processableData.startsWith('@SCHEMA|')) {
                processableData = parseToon(processableData);
                processableType = 'json';
            } else {
                processableType = 'text';
            }
        }
        else if (type === 'csv' || type === 'xlsx') {
            processableType = 'text';
        }

        tracker.endStep({ normalizedType: processableType });


        // --- PHASE 2: LOGIC EXTRACTION (Sample -> Analyze) ---
        console.log(`[OpenAI Processor] 🚀 Sending data to LogicExtractor... (Type: ${processableType})`);

        // Pass to Logic Extractor
        const logicResult = await extractMappingLogic(processableData, processableType, fileName, parameters);



        if (logicResult.success) {
            // Check if we need confirmation (e.g. Low Confidence)
            const needsConfirmation = process.env.REQUIRE_LLM_CONFIRMATION === 'true' && logicResult.tier === 3 && !skipConfirmation;
            if (needsConfirmation) {
                return {
                    needsConfirmation: true,
                    confirmationType: 'LOW_CONFIDENCE_FALLBACK',
                    analysis: {
                        tier: logicResult.tier,
                        confidence: Math.round(logicResult.confidence * 100),
                        message: logicResult.message
                    },
                    performance: tracker.getReport()
                };
            }

            // --- PHASE 3: EXECUTION (Apply Logic) ---
            executionResult = await applyLogicToDataset(processableData, logicResult.logic, fileName);
        } else {
            // LOGIC EXTRACTION FAILED -> FALLBACK
            console.warn(`[OpenAI Processor] ⚠️ Logic Extraction Failed or Incomplete. Attempting Page-by-Page Direct LLM Extraction...`);

            if (rawPages.length > 0) {
                executionResult = await processPagesDirectly(rawPages, fileName, parameters);
            } else {
                throw new Error(`Logic Extraction Failed: ${logicResult.error}`);
            }
        }

        if (!executionResult.success || (executionResult.success && (!executionResult.data || executionResult.recordsProcessed === 0))) {
            const failureReason = executionResult.error || "Scenario A yield 0 records (Logic Mismatch)";
            console.warn(`[OpenAI Processor] ⚠️ Execution failed or empty: ${failureReason}`);

            // AUTO-HEAL: If logic failed (e.g. invalid regex), invalidate the template so next run is fresh!
            if (logicResult.source === 'template' || logicResult.source === 'gpt') {
                console.warn('\n\n================================================================================================');
                console.warn('🚨 CRITICAL ERROR: LOGIC EXECUTION FAILED');
                console.warn(`[OpenAI Processor] 🗑️ Invalidating bad template for signature: ${logicResult.signature}`);
                console.warn('================================================================================================\n\n');

                if (logicResult.signature) {
                    await invalidateTemplate(logicResult.signature);
                } else if (logicResult.templateName) {
                    await invalidateTemplateByName(logicResult.templateName);
                }

                // If it failed despite template invalidation, maybe we simply need to try the fallback NOW?
                // For now, ask user to retry which will trigger fresh analysis.
                // If rawPages exist, try direct extraction as a last resort before throwing.
                if (rawPages.length > 0) {
                    console.log('[OpenAI Processor] �️ Template invalidated, retrying with Direct Page-by-Page Extraction...');
                    executionResult = await processPagesDirectly(rawPages, fileName, parameters);
                    if (executionResult.success) {
                        // If fallback worked, return success!
                    } else {
                        throw new Error(`Execution Failed (Template Invalidated, Fallback Failed): ${executionResult.error}. Please retry upload.`);
                    }
                } else {
                    throw new Error(`Execution Failed (Template Invalidated): ${executionResult.error}. Please retry upload.`);
                }
            } else {
                // Retry with Page-by-Page Fallback if we haven't already
                if (rawPages.length > 0) {
                    console.log('[OpenAI Processor] 🔄 Retrying with Direct Page-by-Page Extraction...');
                    executionResult = await processPagesDirectly(rawPages, fileName, parameters);
                    if (executionResult.success) {
                        // If fallback worked, return success!
                    } else {
                        throw new Error(`Execution Failed (Fallback Failed): ${executionResult.error}`);
                    }
                } else {
                    throw new Error(`Execution Failed: ${executionResult.error}`);
                }
            }
        }

        // --- PHASE 4: FINALIZE ---
        const finalPerformance = tracker.getReport();

        return {
            success: true,
            data: executionResult.data,
            performance: finalPerformance,
            logicTier: logicResult.tier
        };

    } catch (error: any) {
        console.error('[OpenAI Processor] 🚨 CRITICAL FAIL-SAFE ACTIVATED:', error.message);
        // @ts-ignore
        tracker.error = error.message;

        // Return a valid object instead of crashing the worker/server
        return {
            data: {},
            allRecords: [],
            performance: tracker.getReport(),
            logicTier: 0,
            error: error.message,
            success: false
        };
    }
}

/**
 * Fallback: Process PDF pages one by one using LLM to extract data directly.
 * SLOW but ROBUST.
 */
async function processPagesDirectly(pages: string[], fileName: string, parameters: any[] = []): Promise<ExecutionResult> {
    console.log(`[OpenAI Processor] 🐢 Starting Slow Fallback: processing ${pages.length} pages individually...`);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    let allRecords: any[] = [];
    const tracker = new PerformanceTracker(fileName, 'direct-llm-fallback');

    // Build target schema string (STRICT: No fallbacks)
    const targetSchema = parameters.length > 0
        ? parameters.map(p => p.name).join(', ')
        : "Detected fields from document headers";


    for (let i = 0; i < pages.length; i++) {
        const pageText = pages[i];
        if (pageText.trim().length < 50) {
            console.log(`[OpenAI Processor] ⚠️ Skipping Page ${i + 1} (Empty/Too Short)`);
            continue; // Skip empty pages
        }

        console.log(`[OpenAI Processor] 🐢 Processing Page ${i + 1}/${pages.length} (Scenario B - [v5.2-ELITE])...`);

        // Use ELITE engine from prompts.ts
        const prompt = PROMPTS.STRICT_EXTRACTION_ENGINE(targetSchema, pageText.substring(0, 15000));

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0
            });
            const result = JSON.parse(completion.choices[0].message.content || '{}');
            const records = result.records || result.data || [];
            if (Array.isArray(records) && records.length > 0) {
                console.log(`[OpenAI Processor] ✅ Page ${i + 1} Success: Extracted ${records.length} records.`);
                allRecords.push(...records);
            } else {
                console.warn(`[OpenAI Processor] ⚠️ Page ${i + 1} yielded no data array.`);
            }
        } catch (e: any) {
            console.error(`[OpenAI Processor] ❌ Failed to process page ${i + 1}:`, e.message);
            // Continue to next page - Do not throw!
        }
    }

    console.log(`[OpenAI Processor] ✅ Direct Extraction Complete. Found ${allRecords.length} records.`);

    // Group records (Try State, then City, then Category, then default to Records)
    const grouped: Record<string, any[]> = {};
    allRecords.forEach(record => {
        const groupKey = record.State || record.City || record.Category || 'Records';
        if (!grouped[groupKey]) grouped[groupKey] = [];
        grouped[groupKey].push(record);
    });

    return {
        success: true,
        data: grouped,
        allRecords: allRecords,
        recordsProcessed: allRecords.length,
        performance: tracker.getReport()
    };
}

/**
 * Direct Image-to-Data Extraction using OpenAI Vision
 */
async function processImageDirectly(base64Image: string, fileName: string, mimeType: string = 'image/jpeg', parameters: any[] = []): Promise<ExecutionResult> {
    console.log(`[OpenAI Processor] 👁️ Sending image directly to GPT-4o (Vision)...`);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const tracker = new PerformanceTracker(fileName, 'vision-direct');

    // Build target schema string (STRICT: No fallbacks)
    const targetSchema = parameters.length > 0
        ? parameters.map(p => p.name).join(', ')
        : "Detected fields from document headers";


    // Use ELITE engine from prompts.ts
    const prompt = PROMPTS.STRICT_EXTRACTION_ENGINE(targetSchema);

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType}; base64, ${base64Image} `,
                                detail: "high"
                            },
                        },
                    ],
                },
            ],
            response_format: { type: "json_object" },
            temperature: 0,
            max_tokens: 4096,
        });

        const content = response.choices[0].message.content || '{}';
        const result = JSON.parse(content);
        const allRecords = result.records || result.data || [];

        console.log(`[OpenAI Processor] ✅ Vision Success: Extracted ${allRecords.length} records.`);

        // Group records
        const grouped: Record<string, any[]> = {};
        allRecords.forEach((record: any) => {
            const groupKey = record.State || record.City || record.Category || 'Records';
            if (!grouped[groupKey]) grouped[groupKey] = [];
            grouped[groupKey].push(record);
        });

        return {
            success: true,
            data: grouped,
            allRecords: allRecords,
            recordsProcessed: allRecords.length,
            performance: tracker.getReport()
        };
    } catch (e: any) {
        console.error(`[OpenAI Processor] ❌ Vision Extraction Failed: `, e.message);
        return {
            success: false,
            error: e.message,
            performance: tracker.getReport()
        };
    }
}

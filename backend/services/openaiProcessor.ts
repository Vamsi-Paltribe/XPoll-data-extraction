import OpenAI from 'openai';
import { extractMappingLogic, applyLogicToDataset, invalidateTemplate, invalidateTemplateByName, ExecutionResult } from './logicExtractor';
import { parseToon } from '../utils/toonParser';
import { processPDFToText } from '../utils/pdfTableExtractor';
import { processImageToToon } from '../utils/imageOCR';
import PerformanceTracker from '../utils/performanceTracker';

interface ProcessPayload {
    data: any;
    type: string;
    fileName: string;
    skipConfirmation?: boolean;
    additionalPrompt?: string;
}

/**
 * Unified Document Processor
 * Coordinates: Pre-processing (OCR/PDF extraction) -> Logic Extraction -> Data Application
 */
export async function processDocumentWithOpenAI(payload: ProcessPayload): Promise<any> {
    const { data, type, fileName, additionalPrompt, skipConfirmation } = payload;
    const tracker = new PerformanceTracker(fileName, type);

    try {
        let processableData = data;
        let processableType = type;
        let rawPages: string[] = []; // Store pages for fallback

        // --- PHASE 1: PRE-PROCESSING (Normalize to Text/JSON) ---
        tracker.startStep('Pre-processing');

        if (type === 'pdf') {
            const pdfBuffer = Buffer.from(data, 'base64');
            const result = await processPDFToText(pdfBuffer);
            processableData = result.content;
            rawPages = result.pages; // Keep raw pages for fallback
            processableType = 'text';
            console.log(`[OpenAI Processor] 📄 PDF Extracted. Pages: ${rawPages.length}, Total Length: ${processableData.length}`);
        }
        else if (type === 'image') {
            const imageBuffer = Buffer.from(data, 'base64');
            const result = await processImageToToon(imageBuffer);
            processableData = result.content;
            processableType = 'text';
            console.log(`[OpenAI Processor] 🖼️ Image OCR Complete. Type: ${processableType}`);
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
        const logicResult = await extractMappingLogic(processableData, processableType, fileName);

        let executionResult: ExecutionResult;

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
                executionResult = await processPagesDirectly(rawPages, fileName);
            } else {
                throw new Error(`Logic Extraction Failed: ${logicResult.error}`);
            }
        }

        if (!executionResult.success) {
            console.warn(`[OpenAI Processor] ⚠️ Execution failed: ${executionResult.error}`);

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
                    console.log('[OpenAI Processor] 🔄 Template invalidated, retrying with Direct Page-by-Page Extraction...');
                    executionResult = await processPagesDirectly(rawPages, fileName);
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
                    executionResult = await processPagesDirectly(rawPages, fileName);
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
            data: executionResult.data,
            performance: finalPerformance,
            logicTier: logicResult.tier
        };

    } catch (error: any) {
        console.error('[OpenAI Processor] Error:', error.message);
        // @ts-ignore
        tracker.error = error.message;
        throw error;
    }
}

/**
 * Fallback: Process PDF pages one by one using LLM to extract data directly.
 * SLOW but ROBUST.
 */
async function processPagesDirectly(pages: string[], fileName: string): Promise<ExecutionResult> {
    console.log(`[OpenAI Processor] 🐢 Starting Slow Fallback: processing ${pages.length} pages individually...`);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    let allRecords: any[] = [];
    const tracker = new PerformanceTracker(fileName, 'direct-llm-fallback');

    for (let i = 0; i < pages.length; i++) {
        const pageText = pages[i];
        if (pageText.trim().length < 50) continue; // Skip empty pages

        console.log(`[OpenAI Processor] Processing Page ${i + 1}/${pages.length}...`);

        const prompt = `You are a Data Extractor. Extract structured data from this document page.
TARGET SCHEMA: Name, City, State, Zip, Address, Phone, Email, Type, Amount, Date, Employer
(Extract other valid fields if present).

PAGE CONTENT:
${pageText.substring(0, 5000)}

INSTRUCTIONS:
1. Return a JSON Object with a "data" key containing an Array of Objects.
2. If no data found, return { "data": [] }.
3. Handle "smashed" text carefully.

RETURN JSON ONLY.`;

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0
            });
            const result = JSON.parse(completion.choices[0].message.content || '{}');
            if (result.data && Array.isArray(result.data)) {
                allRecords.push(...result.data);
            }
        } catch (e: any) {
            console.error(`[OpenAI Processor] Failed to process page ${i + 1}:`, e.message);
        }
    }

    console.log(`[OpenAI Processor] ✅ Direct Extraction Complete. Found ${allRecords.length} records.`);

    // Group by state (reusing logic from LogicExtractor would be cleaner check logicExtractor exports)
    // For now, inline grouping
    const grouped: Record<string, any[]> = {};
    allRecords.forEach(record => {
        const state = record.State || 'Unknown';
        if (!grouped[state]) grouped[state] = [];
        grouped[state].push(record);
    });

    return {
        success: true,
        data: grouped,
        recordsProcessed: allRecords.length,
        performance: tracker.getReport() // empty tracker for now
    };
}

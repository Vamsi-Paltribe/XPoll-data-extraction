const pdfParse = require('pdf-parse');

/**
 * Main function: PDF → Text (Using pdf-parse exclusively)
 * Returns full text for logic extraction AND array of pages for fallback processing.
 */
export async function processPDFToText(pdfBuffer: Buffer): Promise<{ type: 'text', content: string, pages: string[], isRaw: boolean, error?: string }> {
    console.log('[PDF Parser] 📄 Extracting text using pdf-parse...');

    try {
        const capturedPages: string[] = [];

        const captureOptions = {
            pagerender: async function (pageData: any) {
                const render_options = {
                    normalizeWhitespace: true,
                    disableCombineTextItems: false
                };

                return pageData.getTextContent(render_options)
                    .then(function (textContent: any) {
                        let lastY: number | null = null;
                        let text = '';
                        for (let item of textContent.items) {
                            if (lastY == item.transform[5] || !lastY) {
                                text += item.str;
                            } else {
                                text += '\n' + item.str;
                            }
                            lastY = item.transform[5];
                        }
                        capturedPages.push(text);
                        return text;
                    });
            }
        };

        try {
            const finalData = await pdfParse(pdfBuffer, captureOptions);
            console.log(`[PDF Parser] ✅ Structured Extraction Complete. Pages: ${finalData.numpages}`);
            return {
                type: 'text',
                content: finalData.text,
                pages: capturedPages,
                isRaw: false
            };
        } catch (structuredError: any) {
            console.warn(`[PDF Parser] ⚠️ Structured extraction failed (${structuredError.message}). Attempting Safe Mode...`);

            try {
                const rawData = await pdfParse(pdfBuffer);
                if (rawData && rawData.text && rawData.text.trim().length > 0) {
                    console.log(`[PDF Parser] ✅ Safe Mode Success. Length: ${rawData.text.length}`);
                    return {
                        type: 'text',
                        content: rawData.text,
                        pages: [rawData.text],
                        isRaw: true
                    };
                } else {
                    throw new Error("Empty content in safe mode");
                }
            } catch (safeErr: any) {
                console.warn(`[PDF Parser] ⚠️ Safe Mode failed. Engaging Ultimate Resilience Mode (Brute Force Scraper)...`);
                const scrapedText = extractTextViaBruteForce(pdfBuffer);

                if (scrapedText.length > 50) {
                    console.log(`[PDF Parser] ✅ Brute Force Scraper succeeded. Extracted ${scrapedText.length} characters.`);
                    return {
                        type: 'text',
                        content: scrapedText,
                        pages: [scrapedText],
                        isRaw: true
                    };
                } else {
                    const finalErr = safeErr.message || structuredError.message || "Unknown PDF Error";
                    throw new Error(finalErr);
                }
            }
        }

    } catch (error: any) {
        console.error('[PDF Parser] ❌ All extraction attempts failed:', error.message);
        return { type: 'text', content: "", pages: [], isRaw: true, error: error.message };
    }
}

/**
 * Brute-force extracts strings from a PDF buffer by searching for text literals ( ... )
 * and hex strings < ... >. Highly resilient to structural corruption.
 */
function extractTextViaBruteForce(buffer: Buffer): string {
    const content = buffer.toString('binary');
    let results: string[] = [];

    const literalRegex = /\(([^)]+)\)/g;
    let match;
    while ((match = literalRegex.exec(content)) !== null) {
        const val = match[1].trim();
        if (val.length > 2 && !val.startsWith('/') && !/^[0-9.\s]+$/.test(val)) {
            results.push(val);
        }
    }

    const hexRegex = /<([0-9A-Fa-f]{4,})>/g;
    while ((match = hexRegex.exec(content)) !== null) {
        try {
            const hex = match[1];
            const decoded = Buffer.from(hex, 'hex').toString('utf-8');
            if (decoded.length > 3 && /^[\x20-\x7E]+$/.test(decoded)) {
                results.push(decoded);
            }
        } catch (e) { }
    }

    return results.join(' ')
        .replace(/\s+/g, ' ')
        .substring(0, 50000);
}

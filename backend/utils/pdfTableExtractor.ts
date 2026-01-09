const pdfParse = require('pdf-parse');

/**
 * Main function: PDF → Text (Using pdf-parse exclusively)
 * Returns full text for logic extraction AND array of pages for fallback processing.
 */
export async function processPDFToText(pdfBuffer: Buffer): Promise<{ type: 'text', content: string, pages: string[], isRaw: boolean }> {
    console.log('[PDF Parser] 📄 Extracting text using pdf-parse...');

    try {
        const pages: string[] = [];

        // Custom render function to separate pages
        const options = {
            pagerender: async function (pageData: any) {
                const render_options = {
                    normalizeWhitespace: true,
                    disableCombineTextItems: false
                };

                return pageData.getTextContent(render_options)
                    .then(function (textContent: any) {
                        let lastY: number | null = null;
                        let text = '';
                        // Basic layout reconstruction based on Y position (similar to what pdf-parse does internally but per page)
                        for (let item of textContent.items) {
                            if (lastY == item.transform[5] || !lastY) {
                                text += item.str;
                            } else {
                                text += '\n' + item.str;
                            }
                            lastY = item.transform[5];
                        }
                        return text;
                    });
            }
        };

        const data = await pdfParse(pdfBuffer, options);

        // pdf-parse with custom pagerender returns "text" as concatenated pages separate by \n\n usually,
        // BUT the catch is getting the pages array out.
        // pdf-parse logic: it calls pagerender for each page and joins them.
        // To strictly get the array, we can use the 'max' option to iterate? 
        // OR simpler: we can just split the result by Form Feed (\f) if injected, 
        // but pdf-parse standard doesn't inject it by default unless we do.

        // Let's re-run carefully. The standard pdf-parse usage returns `data.text`.
        // If we want pages, we need to capture them during render.
        // We can use a closure to capture pages.

        // Re-defining for closure capture
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
                            // Simple space/newline heuristic
                            if (lastY == item.transform[5] || !lastY) {
                                text += item.str;
                            } else {
                                text += '\n' + item.str;
                            }
                            lastY = item.transform[5];
                        }
                        capturedPages.push(text); // Capture!
                        return text;
                    });
            }
        };

        const finalData = await pdfParse(pdfBuffer, captureOptions);

        console.log(`[PDF Parser] ✅ Extraction Complete. Total Pages: ${finalData.numpages}, Length: ${finalData.text.length}`);

        return {
            type: 'text',
            content: finalData.text,
            pages: capturedPages,
            isRaw: true // pdf-parse is considered "raw" stream vs exact coordinate layout
        };

    } catch (error: any) {
        console.error('[PDF Parser] ❌ Extraction failed:', error.message);
        return { type: 'text', content: "", pages: [], isRaw: true };
    }
}

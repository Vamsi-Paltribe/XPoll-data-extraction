const PDFParser = require("pdf2json");

interface ToonResult {
    type: 'text' | 'toon';
    content: string;
}

// Helper: Decode URI encoded text from pdf2json
const decode = (str: string) => {
    try {
        return decodeURIComponent(str);
    } catch (e) {
        return str;
    }
};

// Wrapper for pdf2json to get Structured JSON
async function parsePdfStructure(buffer: Buffer): Promise<any> {
    console.log('[PDF Parser] 🎬 Starting raw PDF structure parsing (pdf2json)...');
    return new Promise((resolve, reject) => {
        // 0 = Defaults to JSON parsing (Structured)
        const pdfParser = new PDFParser(null, 0);

        pdfParser.on("pdfParser_dataError", (errData: any) => {
            console.error('[PDF Parser] ❌ Raw parsing error:', errData.parserError);
            reject(new Error(errData.parserError));
        });

        pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
            console.log('[PDF Parser] ✅ Raw parsing successful. Data ready.');
            resolve(pdfData);
        });

        pdfParser.parseBuffer(buffer);
    });
}


/**
 * Main function: PDF → Text (Preserving Layout as best as possible)
 * Returns full text for logic extraction AND array of pages for fallback processing.
 */
export async function processPDFToText(pdfBuffer: Buffer): Promise<{ type: 'text', content: string, pages: string[] }> {
    console.log('[PDF Parser] 📄 Extracting text from PDF (Layout Preserved)...');

    const pdfData = await parsePdfStructure(pdfBuffer);
    console.log(pdfData);
    // We reuse reconstructTextFromJSON but we might want the pages separately.
    // Let's refactor reconstruction slightly to return pages too, or just do it here.

    const rawPages = pdfData?.formImage?.Pages || pdfData?.Pages;
    if (!rawPages || !Array.isArray(rawPages)) {
        console.warn('[PDF Parser] ⚠️ No pages found.');
        return { type: 'text', content: '', pages: [] };
    }

    const pages: string[] = [];
    let fullText = "";

    console.log(`[PDF Parser] Processing ${rawPages.length} pages...`);

    rawPages.forEach((page: any, i: number) => {
        // ... (reuse the logic from reconstructTextFromJSON logic here or call it per page) ...
        // For simplicity and DRY, let's make a helper that processes ONE page data.
        const pageText = reconstructPageText(page);
        pages.push(pageText);
        fullText += `--- Page ${i + 1} ---\n${pageText}\n`;
    });

    console.log(`[PDF Parser] ✅ Extraction Complete. Total Length: ${fullText}`);
    return { type: 'text', content: fullText, pages };
}

/**
 * Helper: Process a single page JSON to Text string
 */
function reconstructPageText(page: any): string {
    const rawItems = page.Texts;
    if (!rawItems || rawItems.length === 0) return "";

    const items = rawItems.map((t: any) => ({
        x: t.x,
        y: t.y,
        text: decode(t.R[0].T),
        width: t.w || (decode(t.R[0].T).length * 0.4)
    }));

    // Sort by Y, then X
    const Y_TOLERANCE = 0.4;
    items.sort((a: any, b: any) => {
        if (Math.abs(a.y - b.y) < Y_TOLERANCE) return a.x - b.x;
        return a.y - b.y;
    });

    let currentY = -1;
    let lineBuffer: string = "";
    let pageText = "";
    let lastItem: any = null;

    items.forEach((item: any) => {
        if (currentY !== -1 && Math.abs(item.y - currentY) > Y_TOLERANCE) {
            pageText += lineBuffer.trim() + "\n";
            lineBuffer = "";
            lastItem = null;
        }
        currentY = item.y;

        if (lastItem) {
            const gap = item.x - (lastItem.x + lastItem.width);
            if (gap < 0.6) lineBuffer += item.text;
            else if (gap >= 0.6 && gap < 4.0) lineBuffer += " " + item.text;
            else lineBuffer += "\t" + item.text;
        } else {
            lineBuffer += item.text;
        }
        lastItem = item;
    });

    if (lineBuffer.length > 0) pageText += lineBuffer.trim() + "\n";
    return pageText;
}

const Tesseract = require('tesseract.js');

/**
 * Extract text from image using OCR (no LLM!)
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromImage(imageBuffer) {
    try {
        console.log('[OCR] Starting Tesseract OCR...');

        const { data: { text } } = await Tesseract.recognize(
            imageBuffer,
            'eng',
            {
                logger: m => console.log(`[OCR] ${m.status}: ${Math.round(m.progress * 100)}%`)
            }
        );

        console.log(`[OCR] ✅ Extracted ${text.length} characters`);
        return text;

    } catch (error) {
        console.error('[OCR] Failed:', error.message);
        throw error;
    }
}

/**
 * Detect table structure in OCR text
 * @param {string} text - OCR extracted text
 * @returns {Array} - Table rows
 */
function detectTableInOCR(text) {
    const lines = text.split('\n').filter(l => l.trim());
    const table = [];

    for (const line of lines) {
        // Split by multiple spaces or tabs
        const parts = line.split(/\s{2,}|\t/).filter(p => p.trim());

        if (parts.length >= 3) {
            table.push(parts);
        }
    }

    return table;
}

/**
 * Convert image table to TOON
 * @param {Array} table - Table rows
 * @returns {string} - TOON string
 */
function imageTableToToon(table) {
    if (!table || table.length < 2) return '';

    const headers = table[0];
    const rows = table.slice(1);

    let toon = `@SCHEMA|${headers.join('|')}\n`;

    rows.forEach(row => {
        const paddedRow = [...row];
        while (paddedRow.length < headers.length) {
            paddedRow.push('');
        }
        toon += paddedRow.slice(0, headers.length).join('|') + '\n';
    });

    return toon;
}

/**
 * Main function: Image → TOON (no LLM!)
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<Object>} - TOON data or text
 */
async function processImageToToon(imageBuffer) {
    console.log('[Image→TOON] Extracting text with OCR...');

    const text = await extractTextFromImage(imageBuffer);

    console.log('[Image→TOON] Detecting table structure...');
    const table = detectTableInOCR(text);

    if (table.length < 2) {
        console.log('[Image→TOON] No table detected, returning raw text');
        return { type: 'text', content: text };
    }

    console.log(`[Image→TOON] Found table with ${table.length} rows`);

    const toonString = imageTableToToon(table);

    console.log(`[Image→TOON] ✅ Converted to TOON`);

    return { type: 'toon', content: toonString };
}

module.exports = {
    extractTextFromImage,
    detectTableInOCR,
    imageTableToToon,
    processImageToToon
};

const pdfParse = require('pdf-parse');

interface ToonResult {
    type: 'text' | 'toon';
    content: string;
}

/**
 * Extract tables from PDF using pattern detection
 * Avoids LLM - uses regex and spacing analysis
 */
export async function extractTablesFromPDF(pdfBuffer: Buffer): Promise<string[][][]> {
    try {
        const data = await pdfParse(pdfBuffer);
        const text = data.text;

        // Detect table-like structures
        const lines = text.split('\n').filter((l: string) => l.trim());
        const tables: string[][][] = [];
        let currentTable: string[][] = [];
        let inTable = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Detect table headers (multiple words separated by spaces/tabs)
            const parts = line.split(/\s{2,}|\t/).filter((p: string) => p.trim());

            if (parts.length >= 3) {
                // Likely a table row
                if (!inTable) {
                    inTable = true;
                    currentTable = [parts]; // First row is header
                } else {
                    currentTable.push(parts);
                }
            } else if (inTable && parts.length < 3) {
                // End of table
                if (currentTable.length > 1) {
                    tables.push(currentTable);
                }
                currentTable = [];
                inTable = false;
            }
        }

        // Add last table if exists
        if (currentTable.length > 1) {
            tables.push(currentTable);
        }

        return tables;
    } catch (error: any) {
        console.error('[PDF Parser] Failed:', error.message);
        throw error;
    }
}

/**
 * Convert PDF table to TOON format
 */
export function pdfTableToToon(table: string[][]): string {
    if (!table || table.length < 2) return '';

    const headers = table[0];
    const rows = table.slice(1);

    let toon = `@SCHEMA|${headers.join('|')}\n`;

    rows.forEach(row => {
        // Pad row if needed
        const paddedRow = [...row];
        while (paddedRow.length < headers.length) {
            paddedRow.push('');
        }
        toon += paddedRow.slice(0, headers.length).join('|') + '\n';
    });

    return toon;
}

/**
 * Main function: PDF → TOON (no LLM!)
 */
export async function processPDFToToon(pdfBuffer: Buffer): Promise<ToonResult> {
    console.log('[PDF→TOON] Extracting tables from PDF...');

    const tables = await extractTablesFromPDF(pdfBuffer);

    if (tables.length === 0) {
        console.log('[PDF→TOON] No tables detected, returning raw text');
        const data = await pdfParse(pdfBuffer);
        return { type: 'text', content: data.text };
    }

    console.log(`[PDF→TOON] Found ${tables.length} table(s)`);

    // Convert largest table to TOON
    const largestTable = tables.reduce((max, table) =>
        table.length > max.length ? table : max
        , tables[0]);

    const toonString = pdfTableToToon(largestTable);

    console.log(`[PDF→TOON] ✅ Converted to TOON: ${largestTable.length - 1} rows`);

    return { type: 'toon', content: toonString };
}

/**
 * TOON Format Utilities (Client-Side)
 * Direct conversion from source formats to TOON
 * Skips JSON intermediate step for maximum efficiency
 */

/**
 * Convert CSV directly to TOON format
 * @param {string} csvString - Raw CSV content
 * @returns {string} - TOON formatted string
 */
export function csvToToon(csvString) {
    const lines = csvString.trim().split('\n');
    if (lines.length < 2) return '';

    // Parse headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    // Create TOON schema
    let toon = `@SCHEMA|${headers.join('|')}\n`;

    // Convert rows directly (skip JSON!)
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        toon += values.join('|') + '\n';
    }

    return toon;
}

/**
 * Convert Excel directly to TOON format
 * @param {Workbook} workbook - XLSX workbook object
 * @returns {string} - TOON formatted string
 */
export function excelToToon(workbook) {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const range = window.XLSX.utils.decode_range(sheet['!ref']);

    // Extract headers from first row
    const headers = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
        const cellAddress = window.XLSX.utils.encode_cell({ r: 0, c: C });
        const cell = sheet[cellAddress];
        headers.push(cell ? String(cell.v) : `col${C}`);
    }

    let toon = `@SCHEMA|${headers.join('|')}\n`;

    // Stream rows directly to TOON (no JSON!)
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
        const row = [];
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cellAddress = window.XLSX.utils.encode_cell({ r: R, c: C });
            const cell = sheet[cellAddress];
            const value = cell ? String(cell.v).replace(/\|/g, '\\|') : '';
            row.push(value);
        }
        toon += row.join('|') + '\n';
    }

    return toon;
}

/**
 * Convert PDF text to TOON-compatible format
 * Note: PDFs are unstructured, so we send as text with metadata
 * @param {string} pdfText - Extracted PDF text
 * @param {number} totalPages - Total pages in PDF
 * @returns {Object} - TOON-compatible object
 */
export function pdfToToon(pdfText, totalPages) {
    // PDFs don't have inherent structure
    // Send as text for LLM to analyze
    return {
        format: 'text',
        content: pdfText,
        metadata: { totalPages }
    };
}

/**
 * Get TOON statistics
 * @param {string} toonString - TOON formatted string
 * @returns {Object} - Statistics
 */
export function getToonStats(toonString) {
    const lines = toonString.split('\n').filter(l => l.trim());
    const schemaLine = lines[0];
    const dataLines = lines.slice(1);

    const fields = schemaLine.replace('@SCHEMA|', '').split('|');

    return {
        fields: fields.length,
        rows: dataLines.length,
        size: toonString.length,
        estimatedTokens: Math.ceil(toonString.length / 4)
    };
}

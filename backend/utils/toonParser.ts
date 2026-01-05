/**
 * TOON Format Backend Parser
 * Parses TOON format received from frontend
 */

interface ToonSample {
    sampleToon: string;
    totalRows: number;
    sampleRows: number;
    fields: string[];
}

/**
 * Parse TOON string to JSON array
 * @param {string} toonString - TOON formatted string
 * @returns {Array} - Array of objects
 */
export function parseToon(toonString: string): any[] {
    const lines = toonString.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    // Parse schema line
    const schemaLine = lines[0];
    if (!schemaLine.startsWith('@SCHEMA|')) {
        throw new Error('Invalid TOON format: missing @SCHEMA header');
    }

    const fields = schemaLine.substring(8).split('|');

    // Parse data rows
    const result: any[] = [];
    for (let i = 1; i < lines.length; i++) {
        // Split on unescaped pipes
        const values = lines[i].split(/(?<!\\)\|/);
        const record: any = {};

        fields.forEach((field, index) => {
            const value = values[index] || '';
            // Unescape pipe characters
            record[field] = value.replace(/\\\|/g, '|');
        });

        result.push(record);
    }

    return result;
}

/**
 * Extract first N rows from TOON for schema detection
 * @param {string} toonString - TOON formatted string
 * @param {number} sampleSize - Number of rows to extract
 * @returns {Object} - Sample data and metadata
 */
export function extractToonSample(toonString: string, sampleSize: number = 5): ToonSample {
    const lines = toonString.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) {
        return { sampleToon: '', totalRows: 0, sampleRows: 0, fields: [] };
    }

    const schemaLine = lines[0];
    const fields = schemaLine.substring(8).split('|');
    const dataLines = lines.slice(1);

    // Get sample lines
    const sampleLines = [schemaLine, ...dataLines.slice(0, sampleSize)];
    const sampleToon = sampleLines.join('\n');

    return {
        sampleToon,
        totalRows: dataLines.length,
        sampleRows: Math.min(sampleSize, dataLines.length),
        fields
    };
}

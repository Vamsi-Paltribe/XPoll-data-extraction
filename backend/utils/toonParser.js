/**
 * TOON Format Backend Parser
 * Parses TOON format received from frontend
 */

/**
 * Parse TOON string to JSON array
 * @param {string} toonString - TOON formatted string
 * @returns {Array} - Array of objects
 */
function parseToon(toonString) {
    const lines = toonString.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    // Parse schema line
    const schemaLine = lines[0];
    if (!schemaLine.startsWith('@SCHEMA|')) {
        throw new Error('Invalid TOON format: missing @SCHEMA header');
    }

    const fields = schemaLine.substring(8).split('|');

    // Parse data rows
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        // Split on unescaped pipes
        const values = lines[i].split(/(?<!\\)\|/);
        const record = {};

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
function extractToonSample(toonString, sampleSize = 5) {
    const lines = toonString.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) {
        return { sample: [], totalRows: 0, fields: [] };
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

module.exports = {
    parseToon,
    extractToonSample
};

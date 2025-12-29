/**
 * Advanced TXT Parser for Complex Formats
 * Handles quoted space-separated, CSV, TSV, and pipe-delimited data
 */

/**
 * Parse quoted space-separated format (like your electoral data)
 * Example: "Name" "City" "State" 123.45
 */
function parseQuotedSpaceSeparated(text) {
    const lines = text.split('\n').filter(l => l.trim() && !l.match(/^-+$/)); // Remove empty and separator lines

    if (lines.length < 2) return null;

    // Find header line (usually first non-separator line)
    let headerIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].match(/^-+$/) && lines[i].trim()) {
            headerIndex = i;
            break;
        }
    }

    const headerLine = lines[headerIndex];
    const headers = parseQuotedLine(headerLine);

    if (headers.length < 3) return null; // Need at least 3 columns

    // Parse data rows
    const data = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.match(/^-+$/) || line.startsWith('Total:')) continue;

        const values = parseQuotedLine(line);

        if (values.length > 0) {
            const record = {};
            headers.forEach((header, index) => {
                record[header] = values[index] || '';
            });
            data.push(record);
        }
    }

    return data.length > 0 ? data : null;
}

/**
 * Parse a line with quoted values and multiple spaces
 */
function parseQuotedLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i += 2;
                continue;
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
                i++;
                continue;
            }
        }

        if (!inQuotes && char === ' ') {
            // Space outside quotes - potential delimiter
            if (current.trim()) {
                values.push(current.trim());
                current = '';
            }
            i++;
            continue;
        }

        current += char;
        i++;
    }

    // Add last value
    if (current.trim()) {
        values.push(current.trim());
    }

    return values;
}

/**
 * Parse standard CSV
 */
function parseCSV(text) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    if (headers.length < 2) return null;

    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const record = {};
        headers.forEach((header, index) => {
            record[header] = values[index] || '';
        });
        data.push(record);
    }

    return data;
}

/**
 * Parse TSV (tab-separated)
 */
function parseTSV(text) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;

    const headers = lines[0].split('\t').map(h => h.trim());
    if (headers.length < 2) return null;

    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('\t').map(v => v.trim());
        const record = {};
        headers.forEach((header, index) => {
            record[header] = values[index] || '';
        });
        data.push(record);
    }

    return data;
}

/**
 * Parse pipe-delimited
 */
function parsePipeDelimited(text) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;

    const headers = lines[0].split('|').map(h => h.trim());
    if (headers.length < 2) return null;

    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('|').map(v => v.trim());
        const record = {};
        headers.forEach((header, index) => {
            record[header] = values[index] || '';
        });
        data.push(record);
    }

    return data;
}

/**
 * Auto-detect format and parse TXT to JSON
 */
function parseTXTToJSON(text) {
    // Try each parser in order
    const parsers = [
        { name: 'CSV', fn: parseCSV },
        { name: 'TSV', fn: parseTSV },
        { name: 'Pipe', fn: parsePipeDelimited },
        { name: 'Quoted Space', fn: parseQuotedSpaceSeparated }
    ];

    for (const parser of parsers) {
        try {
            const result = parser.fn(text);
            if (result && result.length > 0) {
                console.log(`[TXT Parser] Detected format: ${parser.name}`);
                return result;
            }
        } catch {
            // Try next parser
        }
    }

    return null; // No format detected
}

// Export for ES6 modules (React)
export { parseTXTToJSON, parseQuotedSpaceSeparated, parseCSV, parseTSV, parsePipeDelimited };

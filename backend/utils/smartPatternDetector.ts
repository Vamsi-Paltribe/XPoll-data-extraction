/**
 * Smart Pattern Detector
 * Analyzes first 5 lines to detect structure WITHOUT LLM
 * Only uses LLM if pattern cannot be determined
 */

interface FieldPattern {
    regex: RegExp;
    examples: string[];
}

interface StructureResult {
    delimiter: string | RegExp;
    columnCount: number;
    hasHeader: boolean;
}

interface MappingResult {
    mapping: Record<string, number>;
    confidence: number;
    matchCount: number;
}

interface AnalysisResult {
    needsLLM: boolean;
    reason?: string;
    useSmartLLM?: boolean;
    structure?: any;
    sample?: string;
    sampleLines?: number;
    totalLines?: number;
    needsRestructuring?: boolean;
    totalLength?: number;
}

/**
 * Common field patterns for electoral data
 */
const FIELD_PATTERNS: Record<string, FieldPattern> = {
    name: {
        regex: /^[A-Z][a-z]+(\s[A-Z][a-z]+)+$/,
        examples: ['John Doe', 'Jane Smith']
    },
    email: {
        regex: /^[\w\.-]+@[\w\.-]+\.\w+$/,
        examples: ['john@example.com']
    },
    phone: {
        regex: /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/,
        examples: ['555-123-4567', '(555) 123-4567']
    },
    amount: {
        regex: /^\$?\d+(\.\d{2})?$/,
        examples: ['500', '$500.00', '1234.56']
    },
    date: {
        regex: /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
        examples: ['01/15/2024', '2024-01-15']
    },
    zip: {
        regex: /^\d{5}(-\d{4})?$/,
        examples: ['30301', '02101-1234']
    },
    state: {
        regex: /^[A-Z]{2}$/,
        examples: ['GA', 'MA', 'CA']
    },
    city: {
        regex: /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/,
        examples: ['Atlanta', 'New York', 'Los Angeles']
    }
};

/**
 * Detect if text has consistent structure
 */
export function detectStructure(lines: string[]): StructureResult | null {
    if (lines.length < 2) return null;

    // Try different delimiters
    const delimiters: (string | RegExp)[] = [',', '\t', '|', /\s{2,}/];

    for (const delimiter of delimiters) {
        const firstLineParts = lines[0].split(delimiter).map(p => p.trim());

        // Check if all lines have same number of parts
        const allSameLength = lines.every(line => {
            const parts = line.split(delimiter).map(p => p.trim());
            return parts.length === firstLineParts.length;
        });

        if (allSameLength && firstLineParts.length >= 3) {
            return {
                delimiter,
                columnCount: firstLineParts.length,
                hasHeader: isHeaderRow(firstLineParts)
            };
        }
    }

    return null;
}

/**
 * Check if first row looks like headers
 */
function isHeaderRow(parts: string[]): boolean {
    // Headers usually don't match data patterns
    const dataPatternMatches = parts.filter(part => {
        return Object.values(FIELD_PATTERNS).some(pattern =>
            pattern.regex.test(part)
        );
    });

    // If less than 30% match data patterns, likely a header
    return dataPatternMatches.length < parts.length * 0.3;
}

/**
 * Detect field types from sample data
 */
export function detectFieldTypes(values: string[]): string[] {
    const types: string[] = [];

    for (const value of values) {
        let matchedType = 'text'; // default

        for (const [typeName, pattern] of Object.entries(FIELD_PATTERNS)) {
            if (pattern.regex.test(value)) {
                matchedType = typeName;
                break;
            }
        }

        types.push(matchedType);
    }

    return types;
}

/**
 * Main function: Analyze plain text and decide if LLM is needed
 */
export function analyzePlainText(text: string): AnalysisResult {
    const lines = text.split('\n').filter(l => l.trim());

    // Detect "One Long Line" / Flattened PDF artifact
    // Heuristic: Few lines relative to size OR extremely long lines (indicating pages not split into rows)
    const avgLineLength = lines.length > 0 ? text.length / lines.length : 0;

    if (text.length > 1000 && (lines.length < 5 || avgLineLength > 300)) {
        return {
            needsLLM: true, // Prevents false positive "local processing" attempts
            needsRestructuring: true,
            reason: `Text appears flattened (Avg line length: ${Math.round(avgLineLength)})`,
            sample: text.substring(0, 2000), // Send first 2k chars to LLM to find pattern
            totalLength: text.length
        };
    }

    if (lines.length < 2) {
        return { needsLLM: true, reason: 'Insufficient data' };
    }

    // Take first 50 lines as sample
    const sample = lines.slice(0, Math.min(50, lines.length));

    // Detect structure
    const structure = detectStructure(sample);

    if (!structure) {
        return {
            needsLLM: true,
            reason: 'No consistent structure detected locally',
            useSmartLLM: true, // Try LLM for pattern detection first
            sample: sample.join('\n'),
            sampleLines: sample.length,
            totalLines: lines.length
        };
    }

    // Structure found! Extract headers and field types
    // @ts-ignore - dynamic delimiter split
    const firstLine = sample[0].split(structure.delimiter).map(p => p.trim());
    // @ts-ignore
    const secondLine = sample[1].split(structure.delimiter).map(p => p.trim());

    const headers = structure.hasHeader ? firstLine : null;
    const fieldTypes = detectFieldTypes(secondLine);

    // Map detected types to target schema
    const mapping = mapFieldsToSchema(headers, fieldTypes);

    if (mapping.confidence > 0.7) {
        // High confidence - no LLM needed!
        return {
            needsLLM: false,
            structure: {
                delimiter: structure.delimiter,
                headers: headers || fieldTypes.map((t, i) => `col${i}`),
                fieldTypes,
                mapping
            },
            totalLines: lines.length,
            sampleLines: sample.length
        };
    } else {
        // Low confidence - use LLM for first 5 lines only
        return {
            needsLLM: true,
            reason: 'Low confidence in pattern detection',
            useSmartLLM: true, // Only send 5 lines, not all
            structure,
            sample: sample.join('\n'),
            totalLines: lines.length
        };
    }
}

/**
 * Map detected fields to target schema
 */
function mapFieldsToSchema(headers: string[] | null, fieldTypes: string[]): MappingResult {
    const targetSchema = ['Name', 'City', 'State', 'Zip', 'Address', 'Phone', 'Email', 'Type', 'Amount', 'Date', 'Employer'];
    const mapping: Record<string, number> = {};
    let matchCount = 0;

    fieldTypes.forEach((type, index) => {
        const header = headers ? headers[index].toLowerCase() : '';

        // Try to match by type
        if (type === 'name' && !mapping.Name) {
            mapping.Name = index;
            matchCount++;
        } else if (type === 'city' && !mapping.City) {
            mapping.City = index;
            matchCount++;
        } else if (type === 'state' && !mapping.State) {
            mapping.State = index;
            matchCount++;
        } else if (type === 'amount' && !mapping.Amount) {
            mapping.Amount = index;
            matchCount++;
        } else if (type === 'email' && !mapping.Email) {
            mapping.Email = index;
            matchCount++;
        } else if (type === 'phone' && !mapping.Phone) {
            mapping.Phone = index;
            matchCount++;
        } else if (type === 'date' && !mapping.Date) {
            mapping.Date = index;
            matchCount++;
        } else if (type === 'zip' && !mapping.Zip) {
            mapping.Zip = index;
            matchCount++;
        }

        // Try to match by header name
        if (headers && header.includes('name')) mapping.Name = index;
        if (headers && header.includes('city')) mapping.City = index;
        if (headers && header.includes('state')) mapping.State = index;
        if (headers && header.includes('amount')) mapping.Amount = index;
    });

    return {
        mapping,
        confidence: matchCount / targetSchema.length,
        matchCount
    };
}

// Exported via function keywords

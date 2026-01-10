/**
 * JSON-First Pattern Analyzer
 * Analyzes JSON structure to determine if LLM is needed
 * Optimized for 95% token reduction
 */

interface FieldPatterns {
    [key: string]: RegExp;
}

// FIELD_PATTERNS are used for heuristic type detection
const FIELD_PATTERNS: FieldPatterns = {
    name: /^[A-Z][a-z]+(\s[A-Z][a-z]+)+$/,
    email: /^[\w\.-]+@[\w\.-]+\.\w+$/,
    phone: /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/,
    amount: /^\$?\d+(\.\d{2})?$/,
    date: /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
    zip: /^\d{5}(-\d{4})?$/,
    state: /^[A-Z]{2}$/,
    city: /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/
};

// Aliases for common fields to assist local mapping
const DEFAULT_ALIASES: Record<string, string[]> = {
    Name: ['name', 'full_name', 'fullname', 'person', 'donor', 'candidate'],
    City: ['city', 'town', 'municipality', 'jurisdiction'],
    State: ['state', 'st', 'province'],
    Zip: ['zip', 'zipcode', 'postal', 'postalcode'],
    Address: ['address', 'street', 'addr'],
    Phone: ['phone', 'telephone', 'tel', 'mobile'],
    Email: ['email', 'e-mail', 'mail'],
    Type: ['type', 'transaction_type', 'category', 'office'],
    Amount: ['amount', 'value', 'sum', 'total', 'contribution'],
    Date: ['date', 'transaction_date', 'dt', 'year'],
    Employer: ['employer', 'company', 'organization', 'committee']
};

interface AnalysisResult {
    needsLLM: boolean;
    reason?: string;
    useSmartLLM?: boolean;
    sample?: any[];
    totalRows?: number;
    mapping?: Record<string, string>;
    confidence?: number;
    sampleRows?: number;
    partialMapping?: Record<string, string>;
    convertToTOON?: boolean;
}

interface MappingResult {
    fieldMapping: Record<string, string>;
    matchCount: number;
    confidence: number;
}

/**
 * Analyze JSON array structure
 * @param {Array} jsonArray - Array of objects
 * @param {Array} parameters - Bucket parameters to map against
 * @param {number} sampleSize - Number of rows to analyze (10-20)
 * @returns {Object} - Analysis result
 */
export function analyzeJSONStructure(jsonArray: any[], parameters: any[] = [], sampleSize: number = 15): AnalysisResult {
    if (!Array.isArray(jsonArray) || jsonArray.length === 0) {
        return { needsLLM: true, reason: 'Empty or invalid data' };
    }

    const sample = jsonArray.slice(0, Math.min(sampleSize, jsonArray.length));

    // Check consistency
    const firstKeys = Object.keys(sample[0]).sort();
    const allConsistent = sample.every(obj => {
        const keys = Object.keys(obj).sort();
        return JSON.stringify(keys) === JSON.stringify(firstKeys);
    });

    if (!allConsistent) {
        return {
            needsLLM: true,
            reason: 'Inconsistent structure',
            useSmartLLM: true,
            sample: sample.slice(0, 50),
            totalRows: jsonArray.length
        };
    }

    // Detect field types and map to target schema
    const mapping = detectFieldMapping(sample[0], sample, parameters);

    console.log(`[JSON Analyzer] Confidence: ${Math.round(mapping.confidence * 100)}%`);
    console.log(`[JSON Analyzer] Matched fields: ${mapping.matchCount}/${parameters.length || '?'}`);

    if (parameters.length > 0 && mapping.confidence >= 0.7) {
        // High confidence - no LLM needed!
        return {
            needsLLM: false,
            mapping: mapping.fieldMapping,
            confidence: mapping.confidence,
            totalRows: jsonArray.length,
            sampleRows: sample.length
        };
    } else {
        // Fallback to LLM for better mapping accuracy if not 100% sure or if complex
        return {
            needsLLM: true,
            useSmartLLM: true,
            confidence: mapping.confidence,
            reason: 'Needs LLM for robust mapping or transformation',
            sample: sample.slice(0, 50),
            totalRows: jsonArray.length,
            partialMapping: mapping.fieldMapping
        };
    }
}

/**
 * Detect field mapping from JSON to target schema
 */
export function detectFieldMapping(firstRow: any, sample: any[], parameters: any[] = []): MappingResult {
    const sourceKeys = Object.keys(firstRow);
    const fieldMapping: Record<string, string> = {};
    let matchCount = 0;

    if (parameters.length === 0) {
        return { fieldMapping, matchCount: 0, confidence: 0 };
    }

    // Try to match each provided parameter
    parameters.forEach((p: any) => {
        const targetField = p.name;
        const lowerTarget = targetField.toLowerCase().replace(/[_\s]/g, '');

        // 1. Check by field name (Direct or Fuzzy match)
        for (const key of sourceKeys) {
            const lowerKey = key.toLowerCase().replace(/[_\s]/g, '');

            // Exact or inclusion match
            if (lowerKey === lowerTarget || lowerTarget.includes(lowerKey) || lowerKey.includes(lowerTarget)) {
                fieldMapping[targetField] = key;
                matchCount++;
                return;
            }
        }

        // 2. Check by value pattern (Heuristic)
        for (const key of sourceKeys) {
            const values = sample.map(row => row[key]).filter(v => v);

            if (values.length > 0) {
                const matchRate = values.filter(v => {
                    const pattern = FIELD_PATTERNS[targetField.toLowerCase()];
                    return pattern && pattern.test(String(v));
                }).length / values.length;

                if (matchRate > 0.8) { // Higher threshold for value-based matching
                    fieldMapping[targetField] = key;
                    matchCount++;
                    return;
                }
            }
        }
    });

    return {
        fieldMapping,
        matchCount,
        confidence: matchCount / parameters.length
    };
}

/**
 * Apply mapping to full dataset
 */
export function applyJSONMapping(jsonArray: any[], mapping: Record<string, string>): any[] {
    return jsonArray.map(row => {
        const mapped: any = {};
        Object.entries(mapping).forEach(([targetField, sourceField]) => {
            mapped[targetField] = row[sourceField] || null;
        });
        return mapped;
    });
}

/**
 * Convert JSON to TOON format (for unstructured cases)
 */
export function jsonToTOON(jsonArray: any[]): string {
    if (!Array.isArray(jsonArray) || jsonArray.length === 0) return '';

    const fields = Object.keys(jsonArray[0]);
    let toon = `@SCHEMA|${fields.join('|')}\n`;

    jsonArray.forEach(record => {
        const values = fields.map(field => {
            const value = record[field];
            if (value === null || value === undefined) return '';
            return String(value).replace(/\|/g, '\\|');
        });
        toon += values.join('|') + '\n';
    });

    return toon;
}

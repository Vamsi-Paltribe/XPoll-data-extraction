/**
 * JSON-First Pattern Analyzer
 * Analyzes JSON structure to determine if LLM is needed
 * Optimized for 95% token reduction
 */

interface FieldPatterns {
    [key: string]: RegExp;
}

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

const TARGET_SCHEMA: { [key: string]: string[] } = {
    Name: ['name', 'full_name', 'fullname', 'person', 'donor'],
    City: ['city', 'town', 'municipality'],
    State: ['state', 'st', 'province'],
    Zip: ['zip', 'zipcode', 'postal', 'postalcode'],
    Address: ['address', 'street', 'addr'],
    Phone: ['phone', 'telephone', 'tel', 'mobile'],
    Email: ['email', 'e-mail', 'mail'],
    Type: ['type', 'transaction_type', 'category'],
    Amount: ['amount', 'value', 'sum', 'total', 'contribution'],
    Date: ['date', 'transaction_date', 'dt'],
    Employer: ['employer', 'company', 'organization']
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
 * @param {number} sampleSize - Number of rows to analyze (10-20)
 * @returns {Object} - Analysis result
 */
export function analyzeJSONStructure(jsonArray: any[], sampleSize: number = 15): AnalysisResult {
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
    const mapping = detectFieldMapping(sample[0], sample);

    console.log(`[JSON Analyzer] Confidence: ${Math.round(mapping.confidence * 100)}%`);
    console.log(`[JSON Analyzer] Matched fields: ${mapping.matchCount}/${Object.keys(TARGET_SCHEMA).length}`);

    if (mapping.confidence >= 0.7) {
        // High confidence - no LLM needed!
        return {
            needsLLM: false,
            mapping: mapping.fieldMapping,
            confidence: mapping.confidence,
            totalRows: jsonArray.length,
            sampleRows: sample.length
        };
    } else if (mapping.confidence >= 0.4) {
        // Medium confidence - use LLM on sample only
        return {
            needsLLM: true,
            useSmartLLM: true,
            confidence: mapping.confidence,
            reason: 'Medium confidence - need LLM verification',
            sample: sample.slice(0, 50),
            totalRows: jsonArray.length,
            partialMapping: mapping.fieldMapping
        };
    } else {
        // Low confidence - unstructured data
        return {
            needsLLM: true,
            useSmartLLM: false,
            confidence: mapping.confidence,
            reason: 'Unstructured data - convert to TOON',
            totalRows: jsonArray.length,
            convertToTOON: true
        };
    }
}

/**
 * Detect field mapping from JSON to target schema
 */
export function detectFieldMapping(firstRow: any, sample: any[]): MappingResult {
    const sourceKeys = Object.keys(firstRow);
    const fieldMapping: Record<string, string> = {};
    let matchCount = 0;

    // Try to match each target field
    Object.entries(TARGET_SCHEMA).forEach(([targetField, aliases]) => {
        // Check by field name
        for (const key of sourceKeys) {
            const lowerKey = key.toLowerCase().replace(/[_\s]/g, '');

            if (aliases.some(alias => lowerKey.includes(alias.replace(/[_\s]/g, '')))) {
                fieldMapping[targetField] = key;
                matchCount++;
                return;
            }
        }

        // Check by value pattern
        for (const key of sourceKeys) {
            const values = sample.map(row => row[key]).filter(v => v);

            if (values.length > 0) {
                const matchRate = values.filter(v => {
                    const pattern = FIELD_PATTERNS[targetField.toLowerCase()];
                    return pattern && pattern.test(String(v));
                }).length / values.length;

                if (matchRate > 0.7) {
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
        confidence: matchCount / Object.keys(TARGET_SCHEMA).length
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

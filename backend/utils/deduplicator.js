/**
 * Data Deduplication Utility
 * Removes exact duplicate rows (all fields must match)
 */

/**
 * Remove duplicate records from array
 * @param {Array} data - Array of objects
 * @returns {Object} - { unique: Array, duplicates: Array, stats: Object }
 */
function deduplicateData(data) {
    if (!Array.isArray(data) || data.length === 0) {
        return { unique: data, duplicates: [], stats: { total: 0, unique: 0, duplicates: 0 } };
    }

    const seen = new Map();
    const unique = [];
    const duplicates = [];

    data.forEach((record, index) => {
        // Create a hash of all field values
        const hash = createRecordHash(record);

        if (seen.has(hash)) {
            // Duplicate found
            duplicates.push({
                index,
                record,
                firstSeenAt: seen.get(hash)
            });
        } else {
            // New unique record
            seen.set(hash, index);
            unique.push(record);
        }
    });

    const stats = {
        total: data.length,
        unique: unique.length,
        duplicates: duplicates.length,
        deduplicationRate: Math.round((duplicates.length / data.length) * 100)
    };

    return { unique, duplicates, stats };
}

/**
 * Create a hash from record values
 * All fields must match for records to be considered duplicates
 */
function createRecordHash(record) {
    // Sort keys to ensure consistent hashing
    const keys = Object.keys(record).sort();

    // Create hash from all field values
    const values = keys.map(key => {
        const value = record[key];
        // Normalize values for comparison
        if (value === null || value === undefined) return 'NULL';
        if (typeof value === 'string') return value.trim().toLowerCase();
        return String(value);
    });

    return values.join('|');
}

/**
 * Deduplicate with detailed logging
 */
function deduplicateWithLogging(data, fileName = 'file') {
    console.log(`[Dedup] Starting deduplication for ${fileName}...`);
    console.log(`[Dedup] Input: ${data.length} records`);

    const startTime = Date.now();
    const result = deduplicateData(data);
    const duration = Date.now() - startTime;

    console.log(`[Dedup] ✅ Completed in ${duration}ms`);
    console.log(`[Dedup] Unique: ${result.stats.unique} records`);
    console.log(`[Dedup] Duplicates: ${result.stats.duplicates} records (${result.stats.deduplicationRate}%)`);

    if (result.stats.duplicates > 0) {
        console.log(`[Dedup] 📊 Sample duplicates:`);
        result.duplicates.slice(0, 3).forEach((dup, i) => {
            console.log(`  ${i + 1}. Row ${dup.index} (duplicate of row ${dup.firstSeenAt})`);
        });
    }

    return result;
}

/**
 * Deduplicate by specific fields only
 * @param {Array} data - Array of objects
 * @param {Array} fields - Fields to check for duplicates
 */
function deduplicateByFields(data, fields) {
    if (!Array.isArray(data) || data.length === 0) {
        return { unique: data, duplicates: [], stats: { total: 0, unique: 0, duplicates: 0 } };
    }

    const seen = new Map();
    const unique = [];
    const duplicates = [];

    data.forEach((record, index) => {
        // Create hash from specified fields only
        const values = fields.map(field => {
            const value = record[field];
            if (value === null || value === undefined) return 'NULL';
            if (typeof value === 'string') return value.trim().toLowerCase();
            return String(value);
        });

        const hash = values.join('|');

        if (seen.has(hash)) {
            duplicates.push({
                index,
                record,
                firstSeenAt: seen.get(hash),
                matchedFields: fields
            });
        } else {
            seen.set(hash, index);
            unique.push(record);
        }
    });

    const stats = {
        total: data.length,
        unique: unique.length,
        duplicates: duplicates.length,
        deduplicationRate: Math.round((duplicates.length / data.length) * 100),
        fieldsChecked: fields
    };

    return { unique, duplicates, stats };
}

module.exports = {
    deduplicateData,
    deduplicateWithLogging,
    deduplicateByFields,
    createRecordHash
};

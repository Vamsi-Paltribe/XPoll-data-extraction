import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import Papa from 'papaparse';
import Tesseract from 'tesseract.js';

/**
 * Parse image file to text using OCR (Tesseract.js)
 */
export async function parseImageToJSON(file) {
    try {
        console.log('[OCR] 🖼️ Starting image text extraction...');
        console.log(`[OCR] 📦 File size: ${file.size} bytes`);

        // Create worker - simplified to avoid DataCloneError
        const worker = await Tesseract.createWorker('eng');

        console.log('[OCR] 📚 Worker initialized');
        console.log('[OCR] 🔍 Performing OCR...');

        const { data } = await worker.recognize(file);

        await worker.terminate();

        console.log(`[OCR] ✅ Extraction complete!`);
        console.log(`[OCR] 📊 Extracted ${data.text.length} characters`);
        console.log(`[OCR] 🎯 Confidence: ${data.confidence.toFixed(2)}%`);
        console.log(`[OCR] 📝 Text preview:`, data.text.substring(0, 300));

        return {
            success: true,
            text: data.text,
            confidence: data.confidence,
            words: data.words?.length || 0,
            lines: data.lines?.length || 0
        };

    } catch (error) {
        console.error('[OCR] ❌ Error:', error.message);
        return {
            success: false,
            error: error.message,
            text: ''
        };
    }
}

/**
 * Parse CSV/Excel file to JSON array
 */
export async function parseExcelToJSON(file) {
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames[0];
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        return {
            success: true,
            data: json,
            rowCount: json.length,
            columns: json.length > 0 ? Object.keys(json[0]) : []
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            data: []
        };
    }
}

/**
 * Parse PDF file to structured JSON
 * Attempts to detect tabular data and parse accordingly
 */
export async function parsePDFToJSON(file) {
    let fullText = "";

    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + "\n";
        }

        console.log(`[PDF Parser] Extracted ${fullText.length} characters from ${pdf.numPages} pages`);

        // Try to parse as structured data
        const parseResult = parseTextToJSON(fullText);

        if (parseResult.success && parseResult.data.length > 0) {
            return {
                success: true,
                data: parseResult.data,
                rowCount: parseResult.data.length,
                columns: Object.keys(parseResult.data[0]),
                parseMethod: parseResult.method,
                rawText: fullText // Include rawText as backup
            };
        }

        // If parsing failed, return raw text for backend processing
        return {
            success: false,
            rawText: fullText,
            error: 'Could not detect structured data in PDF',
            data: []
        };

    } catch (error) {
        console.error('[PDF Parser] Error:', error.message);

        // Return error with any extracted text
        return {
            success: false,
            error: error.message,
            rawText: fullText || "", // Ensure rawText is always present
            data: []
        };
    }
}

/**
 * Parse TXT file to structured JSON
 * Detects delimiter and parses accordingly
 */
export async function parseTXTToJSON(file) {
    try {
        const text = await file.text();
        const parseResult = parseTextToJSON(text);

        if (parseResult.success && parseResult.data.length > 0) {
            return {
                success: true,
                data: parseResult.data,
                rowCount: parseResult.data.length,
                columns: Object.keys(parseResult.data[0]),
                delimiter: parseResult.delimiter,
                parseMethod: parseResult.method
            };
        }

        // Return raw text for backend processing
        return {
            success: false,
            rawText: text,
            error: 'Could not detect structured data in TXT file',
            data: []
        };

    } catch (error) {
        console.error('[TXT Parser] Error:', error.message);
        return {
            success: false,
            error: error.message,
            rawText: "", // Ensure rawText is always present
            data: []
        };
    }
}

/**
 * Parse text to JSON by detecting delimiter
 * Supports: comma, tab, pipe, space-separated
 */
function parseTextToJSON(text) {
    const lines = text.split('\n').filter(l => l.trim());

    if (lines.length < 2) {
        return { success: false, data: [] };
    }

    // Try different delimiters
    const delimiters = [
        { char: ',', name: 'comma' },
        { char: '\t', name: 'tab' },
        { char: '|', name: 'pipe' },
        { char: /\s{2,}/, name: 'space' } // Multiple spaces
    ];

    for (const delimiter of delimiters) {
        try {
            const parseResult = Papa.parse(text, {
                delimiter: delimiter.char instanceof RegExp ? '' : delimiter.char,
                header: true,
                skipEmptyLines: true,
                dynamicTyping: false,
                transformHeader: (header) => header.trim()
            });

            if (parseResult.data && parseResult.data.length > 0) {
                const firstRow = parseResult.data[0];
                const keys = Object.keys(firstRow);

                // Check if parsing was successful
                // Valid if: has multiple columns and not all values are empty
                const hasMultipleColumns = keys.length > 1;
                const hasData = keys.some(key => firstRow[key] && firstRow[key].trim());

                if (hasMultipleColumns && hasData) {
                    console.log(`[Text Parser] ✅ Parsed with ${delimiter.name} delimiter: ${parseResult.data.length} rows`);
                    return {
                        success: true,
                        data: parseResult.data,
                        delimiter: delimiter.name,
                        method: 'papaparse'
                    };
                }
            }
        } catch (err) {
            console.log(`[Text Parser] Failed with ${delimiter.name}:`, err.message);
        }
    }

    // Try space-separated with regex
    try {
        const result = parseSpaceSeparated(lines);
        if (result.success) {
            return result;
        }
    } catch (err) {
        console.log('[Text Parser] Space-separated parsing failed:', err.message);
    }

    return { success: false, data: [] };
}

/**
 * Parse space-separated data (fixed-width or multiple spaces)
 */
function parseSpaceSeparated(lines) {
    if (lines.length < 2) return { success: false, data: [] };

    // Assume first line is header
    const headerLine = lines[0];
    const headers = headerLine.split(/\s{2,}/).map(h => h.trim()).filter(h => h);

    if (headers.length < 2) return { success: false, data: [] };

    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/\s{2,}/).map(p => p.trim());

        if (parts.length === headers.length) {
            const record = {};
            headers.forEach((header, index) => {
                record[header] = parts[index] || '';
            });
            records.push(record);
        }
    }

    if (records.length > 0) {
        console.log(`[Text Parser] ✅ Parsed space-separated: ${records.length} rows`);
        return {
            success: true,
            data: records,
            delimiter: 'space',
            method: 'regex'
        };
    }

    return { success: false, data: [] };
}

/**
 * Create smart sample from dataset
 * Deduplicates and takes first N rows
 */
export function createSmartSample(data, sampleSize = 100) {
    if (!Array.isArray(data) || data.length === 0) {
        return {
            sample: [],
            total: 0,
            sampleSize: 0,
            duplicatesRemoved: 0
        };
    }

    // Deduplicate
    const dedupResult = deduplicateData(data);

    // Take first N rows
    const sample = dedupResult.unique.slice(0, Math.min(sampleSize, dedupResult.unique.length));

    return {
        sample,
        total: data.length,
        sampleSize: sample.length,
        duplicatesRemoved: dedupResult.duplicatesRemoved,
        uniqueTotal: dedupResult.unique.length
    };
}

/**
 * Deduplicate data based on content hash
 */
export function deduplicateData(data) {
    if (!Array.isArray(data) || data.length === 0) {
        return { unique: [], duplicatesRemoved: 0 };
    }

    const seen = new Set();
    const unique = [];

    for (const record of data) {
        // Create hash from record content
        const hash = JSON.stringify(record);

        if (!seen.has(hash)) {
            seen.add(hash);
            unique.push(record);
        }
    }

    return {
        unique,
        duplicatesRemoved: data.length - unique.length
    };
}

/**
 * Analyze data quality
 * Returns statistics about the dataset
 */
export function analyzeDataQuality(data) {
    if (!Array.isArray(data) || data.length === 0) {
        return {
            totalRows: 0,
            totalColumns: 0,
            emptyFields: 0,
            completeness: 0
        };
    }

    const totalRows = data.length;
    const columns = Object.keys(data[0]);
    const totalColumns = columns.length;
    const totalFields = totalRows * totalColumns;

    let emptyFields = 0;
    let fieldTypes = {};

    columns.forEach(col => {
        fieldTypes[col] = { empty: 0, filled: 0, types: new Set() };
    });

    data.forEach(record => {
        columns.forEach(col => {
            const value = record[col];

            if (!value || (typeof value === 'string' && !value.trim())) {
                emptyFields++;
                fieldTypes[col].empty++;
            } else {
                fieldTypes[col].filled++;
                fieldTypes[col].types.add(typeof value);
            }
        });
    });

    const completeness = ((totalFields - emptyFields) / totalFields * 100).toFixed(2);

    return {
        totalRows,
        totalColumns,
        columns,
        emptyFields,
        totalFields,
        completeness: parseFloat(completeness),
        fieldTypes: Object.fromEntries(
            Object.entries(fieldTypes).map(([col, stats]) => [
                col,
                {
                    empty: stats.empty,
                    filled: stats.filled,
                    fillRate: ((stats.filled / totalRows) * 100).toFixed(2) + '%'
                }
            ])
        )
    };
}

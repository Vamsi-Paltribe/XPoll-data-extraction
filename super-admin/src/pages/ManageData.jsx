import { useState } from 'react';
import { FileSpreadsheet, ExternalLink, Info, Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import api from '../services/api';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';

// 1. Import the worker correctly using Vite's ?url syntax
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// 2. Assign the worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const MASTER_SHEET_URL =
    'https://docs.google.com/spreadsheets/d/1wCsebIUQi_YZgYCAsfQyAvyRm3cS2r3OaiDvpkZ8Vyo/edit?gid=0#gid=0';

const ManageData = () => {
    const [uploading, setUploading] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [committing, setCommitting] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [error, setError] = useState(null);

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        setUploading(true);
        setError(null);

        try {
            let parsedData = null;
            let fileType = file.name.split('.').pop().toLowerCase();

            if (['xlsx', 'xls', 'csv'].includes(fileType)) {
                // Parse Excel/CSV to JSON Array
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data);
                const sheetName = workbook.SheetNames[0];
                const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                parsedData = { type: 'structured', content: json };
            }
            else if (fileType === 'pdf') {
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;

                let pagesData = [];
                let fullTextConcatenated = "";

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');

                    pagesData.push({ page: i, content: pageText });
                    fullTextConcatenated += pageText + "\n";
                }

                parsedData = {
                    type: 'pdf_text',
                    content: fullTextConcatenated,
                    metadata: { totalPages: pdf.numPages, structure: pagesData }
                };
            }
            // --- NEW TXT FILE LOGIC ---
            else if (fileType === 'txt') {
                const text = await file.text();
                parsedData = {
                    type: 'text',
                    content: text
                };
            }

            // --- SEND TO API ---
            if (parsedData) {
                console.log('parsedData', parsedData);
                const res = await api.post('/admin/upload-document/preview', {
                    fileName: file.name,
                    fileData: parsedData
                });

                setPreviewData(res.data);
                console.log("Extracted Data for Preview:", res.data);
            } else {
                throw new Error("Unsupported file format");
            }

        } catch (err) {
            console.error("Parsing Error:", err);
            setError(`Failed to parse ${file.name.split('.').pop().toUpperCase()}. Ensure the file is not corrupted.`);
            event.target.value = '';
        } finally {
            setUploading(false);
        }
    };

    const handleCommit = async () => {
        if (!previewData) return;
        setCommitting(true);
        setError(null);
        try {
            const res = await api.post('/admin/upload-document/commit', {
                extractedData: previewData.preview
            });
            setUploadResult(res.data);
            setPreviewData(null);
        } catch (err) {
            setError(err.response?.data?.error || 'Commit failed. Please try again.');
        } finally {
            setCommitting(false);
        }
    };

    const handleReject = () => {
        setPreviewData(null);
        setError(null);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <header className="mb-10">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">
                    Manage Master Sheet
                </h1>
                <p className="text-slate-500 font-medium">
                    Centralized data source for all users
                </p>
            </header>
            <div className="mt-8 bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-10 py-6 text-white">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                            <Upload className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Upload PDF Data</h2>
                            <p className="text-purple-100 text-sm mt-0.5">Gemini AI will extract and organize by state</p>
                        </div>
                    </div>
                </div>

                <div className="p-10">
                    <label className="block">
                        <input
                            type="file"
                            accept=".pdf,.xlsx,.xls,.csv"
                            onChange={handleFileUpload}
                            disabled={uploading}
                            className="hidden"
                            id="document-upload"
                        />
                        <div className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${uploading ? 'border-purple-300 bg-purple-50' : 'border-slate-300 hover:border-purple-500 hover:bg-purple-50'}`}>
                            {uploading ? (
                                <div className="flex flex-col items-center gap-4">
                                    <Loader2 className="w-12 h-12 text-purple-600 animate-spin" />
                                    <p className="text-sm font-bold text-purple-900">Processing Document...</p>
                                    <p className="text-xs text-purple-600">Extracting data for AI analysis</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center">
                                        <Upload className="w-8 h-8 text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-slate-900 mb-1">Click to upload or drag and drop</p>
                                        <p className="text-sm text-slate-500">PDF, Excel, or CSV</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </label>

                    {uploadResult && (
                        <div className="mt-6 p-6 bg-emerald-50 border border-emerald-200 rounded-2xl">
                            <div className="flex items-start gap-4">
                                <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-emerald-900 mb-2">
                                        {uploadResult.message}
                                    </p>
                                    <div className="space-y-2">
                                        {uploadResult.summary?.states.map((state) => (
                                            <div key={state.name} className="flex items-center justify-between text-xs">
                                                <span className="font-bold text-emerald-800">{state.name}</span>
                                                <span className="text-emerald-600">{state.recordCount} records</span>
                                            </div>
                                        ))}
                                    </div>
                                    <a
                                        href={MASTER_SHEET_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 mt-4 text-xs font-bold text-emerald-700 hover:text-emerald-900"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                        View in Google Sheets
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mt-6 p-6 bg-red-50 border border-red-200 rounded-2xl">
                            <div className="flex items-start gap-4">
                                <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Preview Modal remains as per your original logic */}
            {previewData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden">
                        <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-8 py-6 text-white">
                            <h2 className="text-2xl font-bold">Review Extracted Data</h2>
                        </div>
                        <div className="p-8 overflow-y-auto max-h-[60vh]">
                            {previewData.summary.states.map((state) => (
                                <div key={state.name} className="mb-8 last:mb-0">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-bold text-slate-900">{state.name}</h3>
                                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                                            {state.recordCount} records
                                        </span>
                                    </div>

                                    {/* Data Table */}
                                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr>
                                                    {state.sampleRecords[0] && Object.keys(state.sampleRecords[0]).map((key) => (
                                                        <th key={key} className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">
                                                            {key}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {state.sampleRecords.map((record, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50">
                                                        {Object.values(record).map((value, vidx) => (
                                                            <td key={vidx} className="px-4 py-3 text-slate-700">
                                                                {value || '-'}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {state.recordCount > 3 && (
                                        <p className="text-xs text-slate-500 mt-2 italic">
                                            Showing first 3 of {state.recordCount} records
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-4">
                            <button onClick={handleReject} className="px-6 py-3 bg-white border-2 border-slate-300 text-slate-700 rounded-xl font-bold">Reject</button>
                            <button onClick={handleCommit} className="px-6 py-3 bg-purple-600 text-white rounded-xl font-bold">Approve & Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageData;
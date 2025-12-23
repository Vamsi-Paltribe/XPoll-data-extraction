import React, { useState } from 'react';
import { FileSpreadsheet, ExternalLink, Info, Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import api from '../services/api';

const MASTER_SHEET_URL =
    'https://docs.google.com/spreadsheets/d/1wCsebIUQi_YZgYCAsfQyAvyRm3cS2r3OaiDvpkZ8Vyo/edit?gid=0#gid=0';

const ManageData = () => {
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [error, setError] = useState(null);

    const handleFileUpload = async (file) => {
        if (!file) return;

        setUploading(true);
        setError(null);
        setUploadResult(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await api.post('/admin/upload-pdf', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setUploadResult(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Upload failed. Please try again.');
        } finally {
            setUploading(false);
        }
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

            <div className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
                {/* Header Banner */}
                <div className="bg-black px-10 py-8 text-white">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                            <FileSpreadsheet className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">Global Data Registry</h2>
                            <p className="text-blue-100 text-sm mt-1">
                                Changes here affect everyone
                            </p>
                        </div>
                    </div>
                </div>

                {/* Warning */}
                <div className="bg-amber-50 px-10 py-5 border-b border-amber-100">
                    <div className="flex items-start gap-4">
                        <Info className="w-5 h-5 text-amber-700 mt-0.5" />
                        <p className="text-sm text-amber-800">
                            This is the master data source. Edits impact all users after they sync.
                        </p>
                    </div>
                </div>

                {/* Action */}
                <div className="p-10">
                    <a
                        href={MASTER_SHEET_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-3 w-full py-5 px-8 bg-black text-white rounded-2xl font-bold uppercase tracking-wider hover:bg-blue-700 transition-colors shadow-md"
                    >
                        <ExternalLink className="w-5 h-5" />
                        Open Google Sheet
                    </a>

                    <p className="text-center text-xs text-slate-400 mt-6">
                        Source: <a href={MASTER_SHEET_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{MASTER_SHEET_URL}</a>
                    </p>
                </div>
            </div>

            {/* PDF Upload Section */}
            <div className="mt-8 bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-10 py-6 text-white">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                            <Upload className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Upload PDF Data</h2>
                            <p className="text-purple-100 text-sm mt-0.5">
                                Gemini AI will extract and organize by state
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-10">
                    {/* Upload Dropzone */}
                    <label className="block">
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => handleFileUpload(e.target.files[0])}
                            disabled={uploading}
                            className="hidden"
                            id="pdf-upload"
                        />
                        <div className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${uploading
                                ? 'border-purple-300 bg-purple-50'
                                : 'border-slate-300 hover:border-purple-500 hover:bg-purple-50'
                            }`}>
                            {uploading ? (
                                <div className="flex flex-col items-center gap-4">
                                    <Loader2 className="w-12 h-12 text-purple-600 animate-spin" />
                                    <p className="text-sm font-bold text-purple-900">Processing with Gemini AI...</p>
                                    <p className="text-xs text-purple-600">Extracting data and organizing by state</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center">
                                        <Upload className="w-8 h-8 text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-slate-900 mb-1">
                                            Click to upload PDF or drag and drop
                                        </p>
                                        <p className="text-sm text-slate-500">
                                            PDF files only, max 10MB
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </label>

                    {/* Success Result */}
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

                    {/* Error Display */}
                    {error && (
                        <div className="mt-6 p-6 bg-red-50 border border-red-200 rounded-2xl">
                            <div className="flex items-start gap-4">
                                <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-bold text-red-900 mb-1">Upload Failed</p>
                                    <p className="text-sm text-red-700">{error}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ManageData;
import React, { useState } from 'react';
import { LayoutTemplate, CheckCircle, XCircle, Database, ChevronLeft, ChevronRight, Loader2, Check } from 'lucide-react';
import { PreviewData } from './types';
import api from '../../services/api';
import { useQueryClient } from '@tanstack/react-query';

interface PreviewModalProps {
    previewData: PreviewData;
    setPreviewData: (data: PreviewData | null) => void;
    handlePageChange: (newPage: number) => void;
    handleApplyFallback: () => void;
    fallbackState: string;
    setFallbackState: (value: string) => void;
    fallbackCity: string;
    setFallbackCity: (value: string) => void;
    refetchJobs?: () => void;
}

const PreviewModal: React.FC<PreviewModalProps> = ({
    previewData,
    setPreviewData,
    handlePageChange,
    handleApplyFallback,
    fallbackState,
    setFallbackState,
    fallbackCity,
    setFallbackCity,
    refetchJobs
}) => {
    const [templateName, setTemplateName] = useState('');
    const [saveTemplate, setSaveTemplate] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const queryClient = useQueryClient();

    const handleReject = async () => {
        if (window.confirm("Are you sure you want to REJECT this job? This data will NOT be saved.")) {
            try {
                setCommitting(true);
                // @ts-ignore
                await api.post(`/jobs/${previewData.jobId}/reject`);
                setPreviewData(null);
                if (refetchJobs) refetchJobs();
            } catch (err: any) {
                const errorMessage = err.response?.data?.error;
                if (errorMessage === "Job status is rejected, cannot reject.") {
                    alert(errorMessage); // Show message as requested
                    setPreviewData(null); // Close modal
                    if (refetchJobs) refetchJobs(); // Refresh state
                    return;
                }
                console.error("Failed to reject job", err);
                setError("Failed to reject job");
            } finally {
                setCommitting(false);
            }
        }
    };

    const handleJobCommit = async () => {
        setCommitting(true);
        try {
            // @ts-ignore
            const res = await api.post(`/jobs/${previewData.jobId}/approve`, {
                extractedData: null // Backend uses Job ID to fetch all records now
            });

            if (saveTemplate && templateName) {
                // Implement template saving logic here if needed
            }

            setPreviewData(null);
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
            queryClient.invalidateQueries({ queryKey: ['master-data'] });
            if (refetchJobs) refetchJobs();

        } catch (err: any) {
            setError(err.response?.data?.error || 'Approval failed.');
        } finally {
            setCommitting(false);
        }
    };


    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-6 md:p-10 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-[95vw] h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col ring-1 ring-black/5">
                {/* Header */}
                <div className="bg-white px-8 py-5 border-b border-slate-100 shrink-0 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <LayoutTemplate className="w-5 h-5 text-purple-600" />
                            Review Extraction
                        </h2>
                        <p className="text-slate-500 text-xs font-medium mt-0.5">Please verify the data before committing to the registry.</p>
                    </div>

                    <div className="flex gap-2">
                        {previewData.tier === 0 && (
                            <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100 flex items-center gap-1.5">
                                <CheckCircle className="w-3.5 h-3.5" /> Template Matched
                            </span>
                        )}
                        {previewData.tier > 0 && (
                            <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-xs font-bold border border-purple-100 flex items-center gap-1.5">
                                <CheckCircle className="w-3.5 h-3.5" /> New Pattern
                            </span>
                        )}
                        <button onClick={() => setPreviewData(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors ml-4">
                            <XCircle className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                </div>

                {/* Validtion Warning */}
                {(() => {
                    const standardSchema = ['Name', 'City', 'State', 'Zip', 'Address', 'Phone', 'Email', 'Type', 'Amount', 'Date', 'Employer'];
                    // Collect all keys from the first record of any state
                    const allKeys = new Set<string>();
                    previewData.summary.states.forEach((s: any) => {
                        if (s.sampleRecords[0]) {
                            Object.keys(s.sampleRecords[0]).forEach(k => allKeys.add(k));
                        }
                    });

                    // Find new keys
                    const newParameters = Array.from(allKeys).filter(k =>
                        !standardSchema.some(s => s.toLowerCase() === k.toLowerCase()) &&
                        k !== '_id' && k !== 'jobId'
                    );

                    return (
                        <>
                            {/* New Parameters Alert */}
                            {newParameters.length > 0 && (
                                <div className="bg-purple-50 px-8 py-3 border-b border-purple-100 flex items-center justify-between">
                                    <span className="text-xs font-bold text-purple-700 flex items-center gap-2">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                                        </span>
                                        New Parameters Detected: {newParameters.join(', ')}
                                    </span>
                                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Will be added to schema</span>
                                </div>
                            )}

                            {/* Existing Validation Warning */}
                            {previewData.preview['Unknown'] && (
                                <div className="bg-amber-50 px-8 py-3 border-b border-amber-100 flex items-center justify-between">
                                    <span className="text-xs font-bold text-amber-800 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                        {previewData.preview['Unknown'].length} records require categorization (Missing State)
                                    </span>
                                </div>
                            )}
                            {error && (
                                <div className="bg-red-50 px-8 py-3 border-b border-red-100 flex items-center justify-between">
                                    <span className="text-xs font-bold text-red-800 flex items-center gap-2">
                                        <XCircle className="w-4 h-4 text-red-500" />
                                        {error}
                                    </span>
                                </div>
                            )}
                        </>
                    );
                })()}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
                    {/* FALLBACK UI */}
                    {previewData.preview['Unknown'] && (
                        <div className="mb-8 bg-white p-6 rounded-2xl border border-amber-100 shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                            <div className="flex flex-col md:flex-row gap-6 items-end">
                                <div className="flex-1">
                                    <label className="text-xs font-bold uppercase text-slate-400 mb-2 block tracking-wider">Default State</label>
                                    <input
                                        value={fallbackState}
                                        onChange={(e) => setFallbackState(e.target.value)}
                                        placeholder="e.g. California"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs font-bold uppercase text-slate-400 mb-2 block tracking-wider">Default City</label>
                                    <input
                                        value={fallbackCity}
                                        onChange={(e) => setFallbackCity(e.target.value)}
                                        placeholder="e.g. Los Angeles"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none"
                                    />
                                </div>
                                <button
                                    onClick={handleApplyFallback}
                                    className="px-8 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all hover:scale-105"
                                >
                                    Apply Fix
                                </button>
                            </div>
                        </div>
                    )}

                    {/* DATA PREVIEW */}
                    <div className="grid gap-8">
                        {previewData.summary.states.map((state) => (
                            <div key={state.name} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center shrink-0">
                                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                        {state.name === 'Unknown' ? <XCircle className="w-5 h-5 text-red-500" /> : <Database className="w-4 h-4 text-slate-400" />}
                                        {state.name}
                                    </h3>
                                    <span className="text-xs font-mono font-medium text-slate-400">{state.recordCount} records</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-white text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                                            <tr>
                                                {state.sampleRecords[0] && Object.keys(state.sampleRecords[0]).map(k => (
                                                    <th key={k} className="px-6 py-3 whitespace-nowrap">{k}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {state.sampleRecords.map((r, i) => (
                                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                    {Object.values(r).map((v, j) => (
                                                        <td key={j} className="px-6 py-3 text-slate-600 max-w-[200px] truncate">
                                                            {typeof v === 'object' ? JSON.stringify(v) : (v as React.ReactNode) || '-'}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Pagination Footer */}
                {previewData.pagination && (
                    <div className="bg-white px-8 py-3 border-t border-slate-100 flex items-center justify-between shrink-0">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Page {previewData.pagination.current} of {previewData.pagination.pages}
                            <span className="ml-2 bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full lowercase tracking-normal">
                                {previewData.pagination.total} records
                            </span>
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handlePageChange(previewData.pagination!.current - 1)}
                                disabled={previewData.pagination.current <= 1}
                                className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5 text-slate-600" />
                            </button>
                            <button
                                onClick={() => handlePageChange(previewData.pagination!.current + 1)}
                                disabled={previewData.pagination.current >= previewData.pagination.pages}
                                className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
                            >
                                <ChevronRight className="w-5 h-5 text-slate-600" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Footer Actions */}
                <div className="p-6 bg-white border-t border-slate-100 flex justify-between items-center shrink-0">
                    <button
                        onClick={handleReject}
                        className="px-6 py-3 border hover:bg-slate-50 text-slate-600 font-bold rounded-xl transition-all"
                    >
                        Reject
                    </button>

                    <div className="flex items-center gap-4">
                        {previewData.tier > 0 && (
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={saveTemplate}
                                        onChange={(e) => setSaveTemplate(e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                    />
                                    <span className="text-sm font-bold text-slate-700">Save as Template</span>
                                </label>
                                {saveTemplate && (
                                    <input
                                        type="text"
                                        value={templateName}
                                        onChange={(e) => setTemplateName(e.target.value)}
                                        placeholder="Template Name..."
                                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none w-56 transition-all animate-in fade-in slide-in-from-left-2"
                                        autoFocus
                                    />
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleJobCommit}
                            disabled={committing || !!previewData.preview['Unknown']}
                            className="px-8 py-3 bg-slate-900 hover:bg-black text-white font-bold rounded-xl shadow-lg shadow-purple-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {committing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                            Approve & Commit
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default PreviewModal;

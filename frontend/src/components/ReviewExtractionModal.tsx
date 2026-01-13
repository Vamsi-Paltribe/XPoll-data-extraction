import React, { useState, useEffect } from 'react';
import {
    LayoutTemplate,
    Database, ChevronLeft, ChevronRight,
    Loader2, Check, X
} from 'lucide-react';
import api from '../services/api';
import { useQuery } from '@tanstack/react-query';
import StateSelector from './StateSelector';

interface ReviewExtractionModalProps {
    job: any;
    onClose: () => void;
    onApprove: (jobId: string, options?: { manualState?: string }) => void;
    onReject: (jobId: string) => void;
    isProcessing: boolean;
}

const ReviewExtractionModal: React.FC<ReviewExtractionModalProps> = ({
    job,
    onClose,
    onApprove,
    onReject,
    isProcessing
}) => {
    const [page, setPage] = useState(1);
    const [manualState, setManualState] = useState('');
    const limit = 15;

    const { data, isLoading } = useQuery({
        queryKey: ['job-records', job._id, page],
        queryFn: async () => {
            const res = await api.get(`/jobs/${job._id}/records?page=${page}&limit=${limit}`);
            return res.data;
        }
    });

    const records = data?.records || [];
    const pagination = data?.pagination || { total: 0, pages: 1 };

    // Close on ESC
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);


    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <style>
                {`
                    .custom-scrollbar::-webkit-scrollbar {
                        height: 8px;
                        width: 8px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                        background: #f8fafc;
                        border-radius: 10px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                        background: #cbd5e1;
                        border-radius: 10px;
                        border: 2px solid #f8fafc;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: #94a3b8;
                    }
                `}
            </style>
            <div
                className="bg-white w-full max-w-6xl h-[85vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col ring-1 ring-black/5 animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-50 rounded-2xl">
                            <LayoutTemplate className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Review Extraction</h2>
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">
                                Verifying <span className="text-slate-900">{job.originalName}</span> • {pagination.total} records detected
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col min-h-0 bg-white">
                    {/* Schema Mapping Summary Overlay (Mini) */}
                    {job.result?.detectedMapping && Object.keys(job.result.detectedMapping).length > 0 && (
                        <div className="px-8 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-6 overflow-x-auto no-scrollbar shrink-0">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap px-2">Active Mapping:</span>
                            {Object.entries(job.result.detectedMapping).map(([source, target]: [string, any]) => (
                                <div key={source} className="flex items-center gap-2 px-3 py-1 bg-white rounded-lg border border-slate-200 shadow-sm whitespace-nowrap">
                                    <span className="text-[10px] text-slate-400 italic font-medium">{source}</span>
                                    <div className="w-2 h-[1px] bg-slate-200" />
                                    <span className="text-[10px] font-bold text-slate-700">{target}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Table Container */}
                    <div className="flex-1 overflow-hidden flex flex-col p-8 pt-4">
                        {isLoading ? (
                            <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                                <p className="text-sm font-bold uppercase tracking-widest">Fetching records...</p>
                            </div>
                        ) : records.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                                <Database className="w-12 h-12 opacity-20" />
                                <p className="text-sm font-bold uppercase tracking-widest">No records found for this job.</p>
                            </div>
                        ) : (
                            <div
                                className="flex-1 overflow-auto rounded-2xl border border-slate-200 shadow-sm custom-scrollbar bg-white"
                            >
                                <table className="w-full text-left text-sm border-separate border-spacing-0">
                                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                                        <tr>
                                            {Object.keys(records[0].data).map(key => (
                                                <th key={key} className="px-6 py-4 font-black text-slate-400 uppercase tracking-widest text-[9px] border-b border-slate-100 whitespace-nowrap min-w-[200px]">
                                                    {key}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {records.map((record: any, idx: number) => (
                                            <tr key={record._id || idx} className="hover:bg-slate-50/50 transition-colors group">
                                                {Object.values(record.data).map((val: any, vIdx) => (
                                                    <td key={vIdx} className="px-6 py-4 text-slate-700 font-bold text-xs border-b border-slate-50/50">
                                                        <span className="truncate block max-w-[200px]" title={String(val)}>
                                                            {val === null || val === undefined || val === "" ? '-' : String(val)}
                                                        </span>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 bg-white border-t border-slate-100 flex items-center justify-between shrink-0">
                    {/* Pagination */}
                    <div className="flex items-center gap-4">
                        <div className="flex gap-1">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1 || isLoading}
                                className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                            >
                                <ChevronLeft className="w-5 h-5 text-slate-600" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                                disabled={page === pagination.pages || isLoading}
                                className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                            >
                                <ChevronRight className="w-5 h-5 text-slate-600" />
                            </button>
                        </div>
                        <span className="text-sm font-bold text-slate-400">
                            Page <span className="text-slate-900">{page}</span> of <span className="text-slate-900">{pagination.pages}</span>
                            <span className="mx-2 text-slate-200">|</span>
                            Total <span className="text-slate-900">{pagination.total}</span> records
                        </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                        <div className="w-[200px]">
                            <StateSelector
                                value={manualState}
                                onChange={setManualState}
                                className="w-full"
                            />
                        </div>

                        <button
                            onClick={() => onReject(job._id)}
                            disabled={isProcessing}
                            className="px-6 py-3 text-slate-500 font-bold hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"
                        >
                            Reject Job
                        </button>
                        <button
                            onClick={() => {
                                onApprove(job._id, manualState ? { manualState } : undefined);
                            }}
                            disabled={isProcessing || !manualState}
                            className="px-8 py-3 bg-slate-900 hover:bg-black text-white font-bold rounded-2xl shadow-xl shadow-slate-900/10 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                        >
                            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                            Approve & Commit
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReviewExtractionModal;

import React, { useState, useEffect } from 'react';
import {
    LayoutTemplate,
    ChevronLeft, ChevronRight,
    Loader2, Check, X
} from 'lucide-react';
import StateSelector from './StateSelector';
import { useJobRecords } from '../hooks';
import {
    MappingSummary,
    ExtractionTable
} from './review';

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

    const { data, isLoading } = useJobRecords(job._id, page, limit);

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
                        <div className={`p-3 ${job.mimeType === 'application/x-sync' ? 'bg-blue-50' : 'bg-purple-50'} rounded-2xl`}>
                            <LayoutTemplate className={`w-6 h-6 ${job.mimeType === 'application/x-sync' ? 'text-blue-600' : 'text-purple-600'}`} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">
                                {job.mimeType === 'application/x-sync' ? 'Review Cloud Sync' : 'Review Extraction'}
                            </h2>
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
                    {job.mimeType !== 'application/x-sync' && job.result?.detectedMapping && Object.keys(job.result.detectedMapping).length > 0 && (
                        <MappingSummary mapping={job.result.detectedMapping} />
                    )}

                    {/* Table Container */}
                    <div className="flex-1 overflow-hidden flex flex-col p-8 pt-4">
                        <ExtractionTable records={records} isLoading={isLoading} />
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

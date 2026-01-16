import React from 'react';
import { Database, CheckCircle, Loader2, AlertTriangle, Eye, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { Job } from '../../types';

interface JobHistoryProps {
    allJobs: Job[] | undefined;
    onReviewJob: (job: Job) => void;
    loadMoreRef: React.RefObject<HTMLDivElement | null>;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
}

export const JobHistory = ({
    allJobs,
    onReviewJob,
    loadMoreRef,
    hasNextPage,
    isFetchingNextPage
}: JobHistoryProps) => {
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
            {allJobs && allJobs.length > 0 ? (
                <>
                    {allJobs.map((job) => (
                        <div
                            key={job._id}
                            className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all"
                        >
                            <div className="flex items-center gap-4">
                                <div className={clsx(
                                    "w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner",
                                    job.status === 'completed' ? "bg-emerald-50 text-emerald-600" :
                                        job.status === 'waiting_approval' ? "bg-[#A8328D]/10 text-[#A8328D]" :
                                            job.status === 'failed' ? "bg-red-50 text-red-600" :
                                                "bg-blue-50 text-blue-600"
                                )}>
                                    {job.status === 'completed' && <CheckCircle size={20} />}
                                    {(job.status === 'processing' || job.status === 'queued') && <Loader2 size={20} className="animate-spin" />}
                                    {job.status === 'failed' && <AlertTriangle size={20} />}
                                    {job.status === 'waiting_approval' && <Eye size={20} />}
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-[#2D384A] truncate max-w-[180px]">{job.originalName}</h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] font-bold text-slate-400">
                                            {new Date(job.createdAt).toLocaleDateString()}
                                        </span>
                                        <span className="w-1 h-1 bg-slate-300 rounded-full" />
                                        <span className={clsx("text-[10px] font-black uppercase tracking-widest", job.status === 'completed' ? "text-emerald-500" : job.status === 'waiting_approval' ? "text-[#A8328D]" : "text-blue-500")}>
                                            {job.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {job.status === 'waiting_approval' && (
                                    <button
                                        onClick={() => onReviewJob(job)}
                                        className="px-4 py-2 bg-[#2D384A] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-black transition-all shadow-lg shadow-black/10"
                                    >
                                        Review
                                    </button>
                                )}
                                {job.status === 'completed' && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold">
                                        <Sparkles size={12} />
                                        {job.tokensConsumed || 0} TOKENS
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Infinite Scroll Indicator */}
                    <div ref={loadMoreRef} className="py-8 flex justify-center">
                        {hasNextPage ? (
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 size={24} className={clsx("animate-spin text-[#A8328D]/30", isFetchingNextPage && "text-[#A8328D]")} />
                                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                                    {isFetchingNextPage ? 'Loading Registry Records' : 'Load More'}
                                </span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3 opacity-20">
                                <Database size={24} />
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">End of Archive</span>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-30">
                    <Database size={48} className="mb-4" />
                    <h3 className="text-xl font-bold">No History</h3>
                    <p className="text-sm">Injest records to see them here.</p>
                </div>
            )}
        </div>
    );
};

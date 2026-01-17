import { useMemo } from 'react';
import { FileText, Hash, Database, Search, Loader2, Eye } from 'lucide-react';
import { cn } from '@/utils';
import { Message, Job } from '@/types';

interface MessageItemProps {
    msg: Message;
    allJobs: Job[] | undefined;
    onReviewJob: (job: Job) => void;
    onViewData: (data: any, pagination: any, prompt: string) => void;
}

export const MessageItem = ({ msg, allJobs, onReviewJob, onViewData }: MessageItemProps) => {
    const embeddedJob = useMemo(() => {
        if (!msg.jobId || !allJobs) return null;
        return allJobs.find(j => j._id === msg.jobId);
    }, [msg.jobId, allJobs]);

    return (
        <div className={cn("flex flex-col gap-2", msg.type === 'user' ? "items-end" : "items-start")}>
            <div className={cn(
                "max-w-[90%] p-4 text-sm font-medium shadow-sm transition-all animate-in zoom-in-95 duration-200",
                msg.type === 'user'
                    ? "bg-[#2D384A] text-white rounded-[20px] rounded-tr-sm"
                    : "bg-white border border-slate-100 text-[#2D384A] rounded-[20px] rounded-tl-sm",
                msg.isError && "border-red-200 bg-red-50 text-red-800"
            )}>
                {msg.file && (
                    <div className="flex items-center gap-3 mb-3 p-3 bg-white/10 rounded-xl border border-white/10">
                        <div className="w-8 h-8 bg-white text-[#2D384A] rounded-lg flex items-center justify-center">
                            <FileText size={16} />
                        </div>
                        <span className="text-xs font-bold truncate max-w-[200px]">{msg.file.name}</span>
                    </div>
                )}

                {msg.isLoading ? (
                    <div className="flex items-center gap-3 py-1">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                        <span className="opacity-70">{msg.content}</span>
                    </div>
                ) : (
                    <>
                        {msg.queryResult && (
                            <div className="mt-3">
                                {/* SCENARIO A: SINGLE RECORD HIGHLIGHT (1-to-1 Answer) */}
                                {!msg.queryResult.summary && msg.queryResult.data?.length === 1 && (
                                    <div
                                        onClick={() => onViewData(msg.queryResult!.data, msg.queryResult!.pagination, msg.queryResult!.prompt)}
                                        className="bg-white border-2 border-indigo-100 rounded-[28px] p-6 mb-4 w-full max-w-[360px] shadow-xl shadow-indigo-500/5 cursor-pointer hover:border-indigo-300 transition-all group relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <Database size={64} className="text-indigo-600" />
                                        </div>

                                        <div className="flex items-center gap-4 mb-5">
                                            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                                                <Hash className="w-7 h-7" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Found Exact Match</p>
                                                <h4 className="text-lg font-black text-slate-900 leading-tight">
                                                    {msg.queryResult.data[0].data?.Name || msg.queryResult.data[0].data?.name || msg.queryResult.data[0].data?.Full_Name || 'Record Found'}
                                                </h4>
                                            </div>
                                        </div>

                                        <div className="space-y-3 mb-5">
                                            {Object.entries(msg.queryResult.data[0].data || {}).slice(0, 3).map(([key, val]: [string, any], idx) => (
                                                <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-none">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{key.replace(/_/g, ' ')}</span>
                                                    <span className="text-xs font-black text-slate-700 truncate max-w-[180px]">{String(val)}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <button className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black tracking-widest uppercase hover:bg-black transition-all flex items-center justify-center gap-2">
                                            <Search className="w-4 h-4" />
                                            View Full Detailed Profile
                                        </button>
                                    </div>
                                )}

                                {/* SCENARIO B: MINI LIST (Small Collection 2-5) */}
                                {!msg.queryResult.summary && msg.queryResult.data && msg.queryResult.data.length > 1 && msg.queryResult.data.length <= 5 && (
                                    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-md mb-4 w-full max-w-[320px]">
                                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Small Collection ({msg.queryResult.data.length})</span>
                                            <span className="text-[10px] font-bold text-indigo-500 animate-pulse">Click to explore</span>
                                        </div>
                                        {msg.queryResult.data.map((rec: any, i: number) => (
                                            <div
                                                key={i}
                                                onClick={() => onViewData(msg.queryResult!.data, msg.queryResult!.pagination, msg.queryResult!.prompt)}
                                                className="px-4 py-3 border-b border-slate-50 last:border-none flex items-center gap-3 hover:bg-indigo-50 transition-colors cursor-pointer group"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-indigo-100 group-hover:text-indigo-600 flex items-center justify-center text-slate-500 font-bold text-xs shadow-sm transition-colors">
                                                    {i + 1}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-bold text-slate-800 text-sm truncate group-hover:text-indigo-900 transition-colors">{rec.data?.Name || rec.data?.name || rec.data?.Full_Name || 'Record'}</p>
                                                    <p className="text-xs text-slate-400 truncate opacity-80">{rec.data?.City || rec.data?.city || rec.data?.Account || 'Details Hidden'}</p>
                                                </div>
                                                <Search className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* SCENARIO C: DATASET SUMMARY (Large Dataset > 5) */}
                                {!msg.queryResult.summary && msg.queryResult.pagination && msg.queryResult.pagination.total > 5 && (
                                    <div className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-lg mb-4 w-full max-w-[340px] flex flex-col gap-4 border-l-4 border-l-indigo-500">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 shadow-sm">
                                                <Database className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900 text-base">{msg.queryResult.pagination.total.toLocaleString()} Records</p>
                                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Full Dataset Available</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => onViewData(msg.queryResult!.data, msg.queryResult!.pagination, msg.queryResult!.prompt)}
                                            className="w-full py-3 bg-[#2D384A] text-white rounded-xl text-xs font-black hover:bg-black transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-900/10 hover:scale-[1.02] active:scale-[0.98]"
                                        >
                                            <Search className="w-4 h-4" />
                                            VIEW & EXPLORE DATA
                                        </button>
                                    </div>
                                )}

                                {/* SCENARIO D: AGGREGATE STAT (Stat Card) */}
                                {msg.queryResult.summary && (
                                    <div
                                        onClick={() => onViewData(msg.queryResult!.data, msg.queryResult!.pagination, msg.queryResult!.prompt)}
                                        className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 mb-3 flex items-center gap-4 w-fit shadow-sm hover:shadow-md hover:bg-indigo-100 transition-all cursor-pointer group"
                                    >
                                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md text-indigo-600 group-hover:scale-110 transition-transform">
                                            <Hash className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{msg.queryResult.summary.label}</p>
                                            <p className="text-3xl font-black text-indigo-900">{msg.queryResult.summary.value.toLocaleString()}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {msg.content}
                    </>
                )}
            </div>

            {/* Embedded Job Card */}
            {embeddedJob && (
                <div className="ml-1 mt-2 bg-[#F8F9FA] rounded-[24px] p-5 border border-slate-100 flex flex-col gap-3 w-[280px] shadow-sm animate-in slide-up">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[120px]">{embeddedJob.originalName}</span>
                        <span className={cn(
                            "text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wide",
                            embeddedJob.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                                embeddedJob.status === 'waiting_approval' ? "bg-[#A8328D]/10 text-[#A8328D]" :
                                    embeddedJob.status === 'failed' ? "bg-red-100 text-red-700" :
                                        "bg-blue-100 text-blue-700"
                        )}>
                            {embeddedJob.status.replace('_', ' ')}
                        </span>
                    </div>

                    {embeddedJob.status === 'waiting_approval' && (
                        <div className="flex items-center justify-between mt-1">
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-[#2D384A]">Ready</span>
                                <span className="text-[10px] text-slate-400">Review Data</span>
                            </div>
                            <button
                                onClick={() => onReviewJob(embeddedJob)}
                                className="px-4 py-2 bg-[#2D384A] text-white text-xs font-bold rounded-xl hover:bg-[#1a202c] transition-colors flex items-center gap-2 shadow-lg shadow-[#2D384A]/10"
                            >
                                <Eye size={14} /> Review
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

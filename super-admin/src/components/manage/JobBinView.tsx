import React from 'react';
import { RefreshCw, FileText, Clock, ArrowRight, Loader2, AlertCircle, XCircle, CheckCircle2, Upload } from 'lucide-react';

interface JobBinViewProps {
    jobs: any[];
    refetchJobs: () => void;
    handleReviewJob: (job: any) => void;
}

const STATUS_CONFIG: Record<string, any> = {
    completed: {
        color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        icon: <CheckCircle2 className="w-3 h-3" />,
        label: 'Completed'
    },
    processing: {
        color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
        label: 'Processing'
    },
    waiting_approval: {
        color: 'bg-amber-50 text-amber-700 border-amber-100',
        icon: <Clock className="w-3 h-3" />,
        label: 'Needs Review'
    },
    failed: {
        color: 'bg-rose-50 text-rose-700 border-rose-100',
        icon: <AlertCircle className="w-3 h-3" />,
        label: 'Failed'
    },
    rejected: {
        color: 'bg-slate-50 text-slate-500 border-slate-200',
        icon: <XCircle className="w-3 h-3" />,
        label: 'Rejected'
    },
    paused: {
        color: 'bg-orange-50 text-orange-700 border-orange-100',
        icon: <AlertCircle className="w-3 h-3" />,
        label: 'Paused'
    }
};

const JobBinView: React.FC<JobBinViewProps> = React.memo(({ jobs, refetchJobs, handleReviewJob }) => {
    return (
        <div className="flex flex-col h-full bg-slate-50/50 overflow-hidden">
            <div className="h-full overflow-y-auto w-full p-8 max-w-7xl mx-auto">

                {/* Header Section */}
                <div className="flex items-end justify-between mb-10">
                    <div>
                        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Recent Bin</h2>
                        <p className="text-slate-500 text-sm font-medium mt-1">
                            Manage your recent data extraction cycles and job statuses.
                        </p>
                    </div>
                    <button
                        onClick={() => refetchJobs()}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all active:scale-95"
                    >
                        <RefreshCw className="w-4 h-4 text-slate-500" />
                        Refresh
                    </button>
                </div>

                {/* Grid Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {jobs?.map((job) => {
                        const config = STATUS_CONFIG[job.status] || { color: 'bg-slate-100 text-slate-600', label: job.status, icon: null };

                        return (
                            <div
                                key={job._id}
                                className="group relative flex flex-col bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all duration-300"
                            >
                                {/* Card Header: Icon + Status */}
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wider ${config.color}`}>
                                        {config.icon}
                                        {config.label}
                                    </div>
                                </div>

                                {/* Card Body: Title + Date */}
                                <div className="flex-1 min-w-0 mb-6">
                                    <h3
                                        className="font-bold text-slate-900 truncate leading-snug group-hover:text-indigo-600 transition-colors"
                                        title={job.originalName}
                                    >
                                        {job.originalName}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Clock className="w-3 h-3 text-slate-400" />
                                        <p className="text-[11px] text-slate-500 font-medium">
                                            {new Date(job.createdAt).toLocaleDateString()} • {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>

                                {/* Card Footer: Dynamic Actions */}
                                <div className="pt-4 border-t border-slate-100">
                                    {job.status === 'waiting_approval' || job.status === 'completed' ? (
                                        <button
                                            onClick={() => handleReviewJob(job)}
                                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 rounded-xl text-xs font-bold text-white hover:bg-indigo-600 shadow-lg shadow-slate-200 transition-all active:scale-[0.98]"
                                        >
                                            Review Data
                                            <ArrowRight className="w-3.5 h-3.5" />
                                        </button>
                                    ) : job.status === 'failed' || job.status === 'paused' ? (
                                        <div className={`flex flex-col gap-1 text-[11px] p-3 rounded-xl border ${job.status === 'paused' ? 'text-orange-700 bg-orange-50/50 border-orange-100' : 'text-rose-600 bg-rose-50/50 border-rose-100'}`}>
                                            <div className="flex items-center gap-1 font-bold italic">
                                                <AlertCircle className="w-3 h-3" />
                                                {job.status === 'paused' ? 'Job Paused' : 'Extraction Failed'}
                                            </div>
                                            <p className="opacity-90 leading-tight" title={job.result?.error || job.error}>
                                                {job.result?.error || job.error || "Unknown error occurred"}
                                            </p>
                                        </div>
                                    ) : job.status === 'rejected' ? (
                                        <div className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-50 rounded-xl text-xs font-bold text-slate-400 border border-slate-200 italic">
                                            <XCircle className="w-3.5 h-3.5" />
                                            Job Rejected
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-50 rounded-xl text-xs font-bold text-slate-400 border border-slate-100 italic">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Crunching data...
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Empty State */}
                    {(!jobs || jobs.length === 0) && (
                        <div className="col-span-full py-24 flex flex-col items-center justify-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
                            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                                <Upload className="w-10 h-10 text-indigo-300" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">Your bin is empty</h3>
                            <p className="text-slate-500 text-sm max-w-xs text-center mt-2 font-medium">
                                Start by uploading a document in the AI Extraction tab to see your jobs here.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default JobBinView;

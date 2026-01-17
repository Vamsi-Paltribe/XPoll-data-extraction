import { Loader2, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../utils';
import { AnimatePresence, motion } from 'framer-motion';
import { useJobs, useActiveJobs } from '../hooks';

const NotificationBar = () => {
    const { data: activeJobs } = useActiveJobs();
    const { approveJob } = useJobs(undefined);

    if (!activeJobs || activeJobs.length === 0) return null;

    const processingJob = activeJobs.find((j: any) => j.status === 'processing' || j.status === 'queued');
    const waitingJob = activeJobs.find((j: any) => j.status === 'waiting_approval');
    const completedJob = activeJobs.find((j: any) => j.status === 'completed' && new Date(j.updatedAt).getTime() > Date.now() - 60000); // completed recently

    // Priority: Waiting > Processing > Completed
    const primaryJob = waitingJob || processingJob || completedJob;

    if (!primaryJob) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className={cn(
                    "w-full border-b px-4 py-2 flex items-center justify-center text-sm font-medium relative z-40",
                    primaryJob.status === 'waiting_approval' ? "bg-amber-50 border-amber-200 text-amber-900" :
                        primaryJob.status === 'processing' ? "bg-blue-50 border-blue-200 text-blue-900" :
                            primaryJob.status === 'completed' ? "bg-green-50 border-green-200 text-green-900" :
                                "bg-slate-50 border-slate-200"
                )}
            >
                <div className="flex items-center gap-3">
                    {primaryJob.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                    {primaryJob.status === 'waiting_approval' && <AlertCircle className="w-4 h-4 animate-pulse text-amber-600" />}
                    {primaryJob.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-600" />}

                    <span>
                        <span className="font-bold opacity-75 mr-2">
                            {primaryJob.status === 'waiting_approval' ? "ACTION REQUIRED:" :
                                primaryJob.status === 'processing' ? "PROCESSING:" : "COMPLETED:"}
                        </span>
                        {primaryJob.originalName}
                    </span>

                    {/* Quick Actions for Waiting Approval */}
                    {primaryJob.status === 'waiting_approval' && (
                        <div className="flex items-center gap-2 ml-4">
                            <button
                                onClick={() => approveJob.mutate({ jobId: primaryJob._id })}
                                disabled={approveJob.isPending}
                                className="px-3 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-md text-xs font-bold transition-colors flex items-center gap-1"
                            >
                                {approveJob.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Approve & Commit"}
                            </button>
                            <Link to={`/registry/${primaryJob.bucketId}`} className="text-xs underline hover:text-amber-600">
                                View Details
                            </Link>
                        </div>
                    )}

                    {/* View Link for Processing/Completed */}
                    {primaryJob.status !== 'waiting_approval' && (
                        <Link to={`/registry/${primaryJob.bucketId}`} className="ml-2 opacity-60 hover:opacity-100 flex items-center gap-0.5">
                            View <ChevronRight className="w-3 h-3" />
                        </Link>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default NotificationBar;

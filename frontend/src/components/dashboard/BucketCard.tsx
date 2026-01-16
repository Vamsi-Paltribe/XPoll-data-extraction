import { memo } from 'react';
import { Database, Clock, Layers, RotateCcw, ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';

interface BucketCardProps {
    bucket: any;
    isMergeMode: boolean;
    isDraggedOver: boolean;
    onNavigate: (id: string) => void;
    onUnmerge: (id: string) => void;
    attributes?: any;
    listeners?: any;
    setNodeRef?: (el: HTMLElement | null) => void;
    style?: any;
    isDragging?: boolean;
}

export const BucketCard = memo(({
    bucket,
    isMergeMode,
    isDraggedOver,
    onNavigate,
    onUnmerge,
    attributes,
    listeners,
    setNodeRef,
    style,
    isDragging
}: BucketCardProps) => {
    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => !isMergeMode && onNavigate(bucket._id)}
            className={clsx(
                "bg-white p-5 rounded-2xl border transition-all duration-300 group relative overflow-hidden cursor-pointer",
                "shadow-[0px_2px_8px_rgba(45,56,74,0.05)] border-[#2D384A]/10",
                "hover:shadow-[0px_8px_24px_rgba(168,50,141,0.12)] hover:border-[#A8328D]/30",
                isMergeMode && "ring-2 ring-[#A8328D]/10",
                isDraggedOver && "ring-4 ring-[#A8328D] scale-[1.02] shadow-2xl z-20",
                isDragging ? "opacity-0" : "opacity-100"
            )}
        >
            {/* Hover Accent Line */}
            <div className="absolute top-0 inset-x-0 h-1 bg-[#A8328D] opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="flex items-start justify-between mb-4">
                <div className={clsx(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
                    bucket.isMerged ? "bg-[#2D384A] text-[#EEEEEF]" : "bg-[#EEEEEF] text-[#2D384A]"
                )}>
                    {bucket.isMerged ? <Layers size={18} /> : <Database size={18} />}
                </div>

                <div className="flex flex-col items-end gap-1.5">
                    <div className={clsx(
                        "px-2.5 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border",
                        bucket.status === 'paused'
                            ? "bg-slate-100 text-slate-400 border-slate-200"
                            : "bg-emerald-50 text-emerald-600 border-emerald-200/50" // High visibility Green
                    )}>
                        {bucket.status || 'Active'}
                    </div>
                    {bucket.isMerged && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onUnmerge(bucket._id);
                            }}
                            className="px-2 py-1 bg-white border border-[#2D384A]/10 text-[#2D384A] rounded-md text-[8px] font-bold uppercase tracking-tighter hover:bg-[#2D384A] hover:text-white transition-all flex items-center gap-1"
                        >
                            <RotateCcw size={8} /> Unmerge
                        </button>
                    )}
                </div>
            </div>

            <div className="mb-4">
                <h3 title={bucket.name} className="text-sm font-bold text-[#2D384A] group-hover:text-[#A8328D] transition-colors truncate">
                    {bucket.name}
                </h3>
                <div className="flex items-center gap-3 mt-1">
                    <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1 uppercase tracking-tighter">
                        <Clock size={10} className="text-[#A8328D]/60" />
                        {bucket.lastSyncedAt ? new Date(bucket.lastSyncedAt).toLocaleDateString() : 'New Bucket'}
                    </p>
                </div>
            </div>

            <div className="pt-3 border-t border-[#EEEEEF] flex items-center justify-between">
                <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold text-[#2D384A]">
                        {(bucket.recordCount || 0).toLocaleString()}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Records</span>
                </div>

                <div className="w-7 h-7 rounded-lg bg-[#EEEEEF] flex items-center justify-center text-[#2D384A] group-hover:bg-[#A8328D] group-hover:text-white transition-all duration-300">
                    <ArrowUpRight size={14} strokeWidth={3} />
                </div>
            </div>
        </div>
    );
});

import { memo } from 'react';
import { Database, Clock, Layers, RotateCcw, ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';

interface BucketListRowProps {
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

export const BucketListRow = memo(({
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
}: BucketListRowProps) => {
    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => !isMergeMode && onNavigate(bucket._id)}
            className={clsx(
                "group relative bg-white cursor-pointer transition-all duration-200 border-b border-[#2D384A]/5 last:border-0",
                "hover:bg-[#EEEEEF]/50 hover:z-10 px-6 py-3",
                isMergeMode && "bg-[#A8328D]/5",
                isDraggedOver && "bg-[#EEEEEF] ring-2 ring-inset ring-[#A8328D]/30 scale-[1.005] shadow-lg z-20",
                isDragging ? "opacity-0" : "opacity-100"
            )}
        >
            <div className="grid grid-cols-[40px_1fr_120px_100px_80px] items-center gap-4">

                {/* 1. ICON */}
                <div className={clsx(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    bucket.isMerged
                        ? "bg-[#2D384A] text-[#EEEEEF]"
                        : "bg-[#EEEEEF] text-[#2D384A] group-hover:text-[#A8328D]"
                )}>
                    {bucket.isMerged ? <Layers size={16} /> : <Database size={16} />}
                </div>

                {/* 2. NAME & META */}
                <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#2D384A] group-hover:text-[#A8328D] transition-colors truncate">
                        {bucket.name}
                    </h3>
                    <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-[10px] font-bold text-[#2D384A] uppercase tracking-tighter flex items-center gap-1">
                            <Clock size={10} className="text-[#A8328D]/50" />
                            {bucket.lastSyncedAt ? new Date(bucket.lastSyncedAt).toLocaleDateString() : 'New Bucket'}
                        </p>
                    </div>
                </div>

                {/* 3. RECORDS (Fixed width keeps numbers aligned) */}
                <div className="text-right pr-6">
                    <p className="text-[14px] font-bold text-[#2D384A] tracking-tight leading-none">
                        {(bucket.recordCount || 0).toLocaleString()}
                    </p>
                    <p className="text-[8px] font-bold text-[#2D384A]/30 uppercase tracking-widest mt-0.5">Records</p>
                </div>

                {/* 4. STATUS (Emerald Green for Active) */}
                <div className="flex justify-center">
                    <div className={clsx(
                        "px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border text-center w-full max-w-[80px]",
                        bucket.status === 'paused'
                            ? "bg-slate-100 text-slate-400 border-slate-200"
                            : "bg-emerald-50 text-emerald-600 border-emerald-200/50" // High visibility Green
                    )}>
                        {bucket.status || 'Active'}
                    </div>
                </div>

                {/* 5. ACTIONS (Placeholder space even if empty to prevent jumping) */}
                <div className="flex items-center justify-end gap-1 min-w-[80px]">
                    {bucket.isMerged ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onUnmerge(bucket._id);
                            }}
                            className="inline-flex gap-1.5 p-1.5 text-[#2D384A] hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                            title="Unmerge"
                        >
                            <RotateCcw size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-tight">Unmerge</span>
                        </button>
                    ) : (
                        <div className="w-[26px]" />
                    )}

                    <div className="w-8 h-8 rounded-md flex items-center justify-center text-[#2D384A]/20 group-hover:bg-[#A8328D] group-hover:text-white transition-all duration-300">
                        <ArrowUpRight size={16} strokeWidth={2.5} />
                    </div>
                </div>
            </div>
        </div>
    );
});

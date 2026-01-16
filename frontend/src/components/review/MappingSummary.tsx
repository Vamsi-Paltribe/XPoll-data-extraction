interface MappingSummaryProps {
    mapping: Record<string, string>;
}

export const MappingSummary = ({ mapping }: MappingSummaryProps) => (
    <div className="px-8 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-6 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap px-2">Active Mapping:</span>
        {Object.entries(mapping).map(([source, target]) => (
            <div key={source} className="flex items-center gap-2 px-3 py-1 bg-white rounded-lg border border-slate-200 shadow-sm whitespace-nowrap">
                <span className="text-[10px] text-slate-400 italic font-medium">{source}</span>
                <div className="w-2 h-[1px] bg-slate-200" />
                <span className="text-[10px] font-bold text-slate-700">{target}</span>
            </div>
        ))}
    </div>
);

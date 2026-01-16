import { Database, Loader2 } from 'lucide-react';

interface ExtractionTableProps {
    records: any[];
    isLoading: boolean;
}

export const ExtractionTable = ({ records, isLoading }: ExtractionTableProps) => {
    if (isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                <p className="text-sm font-bold uppercase tracking-widest">Fetching records...</p>
            </div>
        );
    }

    if (records.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                <Database className="w-12 h-12 opacity-20" />
                <p className="text-sm font-bold uppercase tracking-widest">No records found for this job.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 shadow-sm custom-scrollbar bg-white">
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
    );
};

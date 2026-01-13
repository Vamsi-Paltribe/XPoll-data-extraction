import React, { useState, useMemo } from 'react';
import { Filter, Settings, Search, CheckCircle, XCircle, Clock } from 'lucide-react';
import clsx from 'clsx';

// --- Types ---
interface RecordData {
    [key: string]: any;
}

interface Record {
    _id?: string;
    data: RecordData;
    status?: 'conflict' | 'valid' | string;
    [key: string]: any;
}

interface Job {
    _id: string;
    originalName: string;
    status: string;
    createdAt: string;
}

interface DataGridProps {
    records: Record[];
    columns: string[];
    onNextPage?: () => void;
    onPrevPage?: () => void;
    totalCount?: number;
    pageInfo?: string;

    // Tabs & State
    activeFilter?: string; // 'all' | 'approvals'
    onFilterChange?: (filter: string) => void;

    // Actions
    onSettingsClick?: () => void;

    // Approvals
    approvalJobs?: Job[];
    onReviewJob?: (job: Job) => void;
}

const DataGrid = ({
    records,
    columns,
    onNextPage,
    onPrevPage,
    totalCount,
    pageInfo,
    activeFilter = 'all',
    onFilterChange,
    onSettingsClick,
    approvalJobs = [],
    onReviewJob
}: DataGridProps) => {

    // --- Local Filter Logic (The "Useful" Filter Button) ---
    const [showFilters, setShowFilters] = useState(false);
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

    const handleColumnFilterChange = (col: string, val: string) => {
        setColumnFilters(prev => ({ ...prev, [col]: val }));
    };

    // Filter the records locally based on input
    const filteredRecords = useMemo(() => {
        if (!showFilters || Object.keys(columnFilters).length === 0) return records;
        return records.filter(rec => {
            return Object.entries(columnFilters).every(([col, val]) => {
                if (!val) return true;
                const cellValue = rec.data[col];
                return String(cellValue ?? '').toLowerCase().includes(val.toLowerCase());
            });
        });
    }, [records, columnFilters, showFilters]);


    // --- Render Content based on Tab ---
    const renderContent = () => {
        if (activeFilter === 'approvals') {
            return (
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
                    {approvalJobs.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle size={24} className="text-emerald-500" />
                            </div>
                            <p className="font-bold text-sm">All caught up!</p>
                            <p className="text-xs">No jobs waiting for approval.</p>
                        </div>
                    ) : (
                        approvalJobs.map(job => (
                            <div key={job._id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col gap-3 group">
                                <div className="flex justify-between items-start">
                                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                        <Clock size={20} />
                                    </div>
                                    <span className="px-2 py-1 bg-slate-50 rounded-lg text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                        Waiting
                                    </span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-[#2D384A] text-sm truncate" title={job.originalName}>{job.originalName}</h4>
                                    <p className="text-xs text-slate-400 mt-1">{new Date(job.createdAt).toLocaleDateString()}</p>
                                </div>
                                <button
                                    onClick={() => onReviewJob?.(job)}
                                    className="w-full py-2 bg-[#2D384A] text-white rounded-xl text-xs font-bold uppercase tracking-wide mt-2 hover:bg-[#A8328D] transition-colors"
                                >
                                    Review
                                </button>
                            </div>
                        ))
                    )}
                </div>
            );
        }

        // Default GRID View
        return (
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-[#FAFAFA] sticky top-0 z-10">
                        <tr>
                            {columns.map((h) => (
                                <th key={h} className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 whitespace-nowrap min-w-[150px]">
                                    {h}
                                </th>
                            ))}
                        </tr>
                        {/* Filter Row */}
                        {showFilters && (
                            <tr className="bg-white">
                                {columns.map((h) => (
                                    <th key={h} className="px-8 py-2 border-b border-slate-50">
                                        <div className="relative">
                                            <Search size={12} className="absolute left-2 top-2.5 text-slate-300" />
                                            <input
                                                className="w-full pl-7 pr-2 py-1.5 bg-slate-50 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-[#A8328D]/50"
                                                placeholder={`Filter ${h}...`}
                                                value={columnFilters[h] || ''}
                                                onChange={(e) => handleColumnFilterChange(h, e.target.value)}
                                            />
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        )}
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filteredRecords.map((rec, i) => (
                            <tr key={rec._id || i} className="group hover:bg-[#F8F9FA] transition-colors">
                                {columns.map(col => (
                                    <td key={col} className="px-8 py-4 text-sm font-medium text-slate-500">
                                        {typeof rec.data[col] === 'object' ? JSON.stringify(rec.data[col]) : (rec.data[col] || '-')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {filteredRecords.length === 0 && (
                            <tr>
                                <td colSpan={columns.length + 2} className="text-center py-20">
                                    <div className="flex flex-col items-center justify-center">
                                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                            <Filter size={20} />
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-900">No records found</h3>
                                        <p className="text-xs text-slate-400 mt-1">Try adjusting your filters.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        );
    };


    return (
        <div className="h-full bg-white rounded-[32px] shadow-[0px_4px_30px_rgba(0,0,0,0.03)] border border-slate-50 flex flex-col overflow-hidden">
            {/* Grid Header */}
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-20">
                <div className="flex gap-4">
                    <button
                        onClick={() => onFilterChange?.('all')}
                        className={clsx(
                            "px-4 py-2 rounded-xl text-xs font-bold transition-colors",
                            activeFilter === 'all' ? "bg-[#F8F9FA] text-[#2D384A]" : "text-slate-400 hover:text-[#2D384A]"
                        )}
                    >
                        All Records
                    </button>
                    <button
                        onClick={() => onFilterChange?.('approvals')}
                        className={clsx(
                            "px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2",
                            activeFilter === 'approvals' ? "bg-[#F8F9FA] text-[#2D384A]" : "text-slate-400 hover:text-[#2D384A]"
                        )}
                    >
                        Needs Approval
                        {approvalJobs.length > 0 && (
                            <span className="w-5 h-5 rounded-full bg-[#A8328D] text-white flex items-center justify-center text-[9px] font-bold">
                                {approvalJobs.length}
                            </span>
                        )}
                    </button>
                    {/* 'Flagged' tab removed as requested */}
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={clsx(
                            "p-2 rounded-lg transition-colors",
                            showFilters ? "bg-[#2D384A] text-white" : "hover:bg-[#F8F9FA] text-slate-400 hover:text-[#2D384A]"
                        )}
                        title="Toggle Filter Row"
                    >
                        <Filter size={18} />
                    </button>
                    <button onClick={onSettingsClick} className="p-2 hover:bg-[#F8F9FA] rounded-lg text-slate-400 hover:text-[#2D384A] transition-colors"><Settings size={18} /></button>
                </div>
            </div>

            {/* Content */}
            {renderContent()}

            {/* Footer Pagination (Only show on grid view) */}
            {activeFilter === 'all' && (
                <div className="p-4 border-t border-slate-50 flex justify-between items-center bg-white text-xs font-bold text-slate-400 px-8">
                    <span>{pageInfo || `Showing ${filteredRecords.length} records`} </span>
                    <span>Total: {totalCount}</span>
                    <div className="flex gap-2">
                        <button
                            onClick={onPrevPage}
                            disabled={!onPrevPage}
                            className="px-3 py-1 bg-[#F8F9FA] rounded-lg hover:bg-slate-200 text-[#2D384A] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Prev
                        </button>
                        <button
                            onClick={onNextPage}
                            disabled={!onNextPage}
                            className="px-3 py-1 bg-[#F8F9FA] rounded-lg hover:bg-slate-200 text-[#2D384A] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DataGrid;

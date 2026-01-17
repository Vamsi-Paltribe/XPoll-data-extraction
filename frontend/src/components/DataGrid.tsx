import { FC } from 'react';
import { Filter, Settings, Search, CheckCircle, Clock } from 'lucide-react';
import { cn } from '@/utils';
import { Job, Record } from '@/types';
import { useDataGrid } from '@/hooks/useDataGrid';

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

    // Pagination Object Support
    pagination?: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
    onPageChange?: (newPage: number) => void;
}

const EmptyState = ({ icon: Icon, title, desc }: { icon: any, title: string, desc: string }) => (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Icon size={24} className={cn(title === 'All caught up!' ? 'text-emerald-500' : 'text-slate-300')} />
        </div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-400 mt-1">{desc}</p>
    </div>
);

const ApprovalCard = ({ job, onReview }: { job: Job, onReview: (job: Job) => void }) => (
    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col gap-3 group">
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
            onClick={() => onReview(job)}
            className="w-full py-2 bg-[#2D384A] text-white rounded-xl text-xs font-bold uppercase tracking-wide mt-2 hover:bg-[#A8328D] transition-colors"
        >
            Review
        </button>
    </div>
);

const GridTable = ({
    columns,
    records,
    showFilters,
    columnFilters,
    onFilterChange
}: {
    columns: string[],
    records: Record[],
    showFilters: boolean,
    columnFilters: any,
    onFilterChange: (col: string, val: string) => void
}) => (
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
                                        onChange={(e) => onFilterChange(h, e.target.value)}
                                    />
                                </div>
                            </th>
                        ))}
                    </tr>
                )}
            </thead>
            <tbody className="divide-y divide-slate-50">
                {records.map((rec, i) => (
                    <tr key={rec._id || i} className="group hover:bg-[#F8F9FA] transition-colors">
                        {columns.map(col => (
                            <td key={col} className="px-8 py-4 text-sm font-medium text-slate-500">
                                {typeof rec.data?.[col] === 'object' ? JSON.stringify(rec.data[col]) : (rec.data?.[col] || '-')}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
        {records.length === 0 && (
            <EmptyState
                icon={Filter}
                title="No records found"
                desc="Try adjusting your filters."
            />
        )}
    </div>
);

const DataGrid: FC<DataGridProps> = (props) => {
    const {
        columns,
        totalCount,
        pageInfo,
        pagination,
        activeFilter = 'all',
        onFilterChange,
        onSettingsClick,
        approvalJobs = [],
        onReviewJob
    } = props;

    const {
        showFilters,
        setShowFilters,
        columnFilters,
        handleColumnFilterChange,
        filteredRecords,
        handleNext,
        handlePrev,
        canNext,
        canPrev
    } = useDataGrid(props);

    const displayPageInfo = pagination
        ? `Page ${pagination.page} of ${pagination.pages} (Total: ${pagination.total})`
        : pageInfo || `Showing ${filteredRecords.length} records`;

    const displayTotal = pagination ? pagination.total : totalCount;

    return (
        <div className="h-full bg-white rounded-[32px] shadow-[0px_4px_30px_rgba(0,0,0,0.03)] border border-slate-50 flex flex-col overflow-hidden">
            {/* Grid Header */}
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-20">
                <div className="flex gap-4">
                    <button
                        onClick={() => onFilterChange?.('all')}
                        className={cn(
                            "px-4 py-2 rounded-xl text-xs font-bold transition-colors",
                            activeFilter === 'all' ? "bg-[#F8F9FA] text-[#2D384A]" : "text-slate-400 hover:text-[#2D384A]"
                        )}
                    >
                        All Records
                    </button>
                    <button
                        onClick={() => onFilterChange?.('approvals')}
                        className={cn(
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
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn(
                            "p-2 rounded-lg transition-colors",
                            showFilters ? "bg-[#2D384A] text-white" : "hover:bg-[#F8F9FA] text-slate-400 hover:text-[#2D384A]"
                        )}
                        title="Toggle Filter Row"
                    >
                        <Filter size={18} />
                    </button>
                    <button onClick={onSettingsClick} className="p-2 hover:bg-[#F8F9FA] rounded-lg text-slate-400 hover:text-[#2D384A] transition-colors">
                        <Settings size={18} />
                    </button>
                </div>
            </div>

            {/* Content */}
            {activeFilter === 'approvals' ? (
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
                    {approvalJobs.length === 0 ? (
                        <div className="col-span-full">
                            <EmptyState
                                icon={CheckCircle}
                                title="All caught up!"
                                desc="No jobs waiting for approval."
                            />
                        </div>
                    ) : (
                        approvalJobs.map(job => (
                            <ApprovalCard
                                key={job._id}
                                job={job}
                                onReview={(j) => onReviewJob?.(j)}
                            />
                        ))
                    )}
                </div>
            ) : (
                <GridTable
                    columns={columns}
                    records={filteredRecords}
                    showFilters={showFilters}
                    columnFilters={columnFilters}
                    onFilterChange={handleColumnFilterChange}
                />
            )}

            {/* Footer Pagination */}
            {activeFilter === 'all' && (
                <div className="p-4 border-t border-slate-50 flex justify-between items-center bg-white text-xs font-bold text-slate-400 px-8">
                    <span>{displayPageInfo}</span>
                    {displayTotal !== undefined && <span>Total: {displayTotal}</span>}
                    <div className="flex gap-2">
                        <button
                            onClick={handlePrev}
                            disabled={!canPrev}
                            className="px-3 py-1 bg-[#F8F9FA] rounded-lg hover:bg-slate-200 text-[#2D384A] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Prev
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!canNext}
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


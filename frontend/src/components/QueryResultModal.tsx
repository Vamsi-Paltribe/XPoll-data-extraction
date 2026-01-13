import React from 'react';
import { X, Database } from 'lucide-react';
import DataGrid from './DataGrid';

interface QueryResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    queryPrompt: string;
    records: any[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
    onPageChange: (newPage: number) => void;
}

const QueryResultModal: React.FC<QueryResultModalProps> = ({
    isOpen,
    onClose,
    queryPrompt,
    records,
    pagination,
    onPageChange
}) => {
    if (!isOpen) return null;

    // Extract columns from first record or default
    const columns = records.length > 0 && records[0].data ? Object.keys(records[0].data) : ['Name', 'City', 'State', 'Category'];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-white w-full max-w-6xl h-[85vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col ring-1 ring-black/5 animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-50 rounded-2xl">
                            <Database className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Query Results</p>
                            <h2 className="text-lg font-bold text-slate-900 truncate max-w-md" title={queryPrompt}>
                                "{queryPrompt}"
                            </h2>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 bg-slate-50/50 p-6 flex flex-col">
                    <DataGrid
                        records={records}
                        columns={columns}
                        totalCount={pagination.total}
                        pageInfo={`Page ${pagination.page} of ${pagination.pages}`}
                        onNextPage={pagination.page < pagination.pages ? () => onPageChange(pagination.page + 1) : undefined}
                        onPrevPage={pagination.page > 1 ? () => onPageChange(pagination.page - 1) : undefined}
                        activeFilter="all"
                        // Disable unrelated features
                        onSettingsClick={undefined}
                        onReviewJob={undefined}
                    />
                </div>
            </div>
        </div>
    );
};

export default QueryResultModal;

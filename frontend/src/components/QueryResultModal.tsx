import React from 'react';
import { X, Database, Check as CheckIcon } from 'lucide-react';
import clsx from 'clsx';
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
    onExport?: (format: 'xlsx' | 'csv', columns: string[]) => Promise<void>;
}

const QueryResultModal: React.FC<QueryResultModalProps> = ({
    isOpen,
    onClose,
    queryPrompt,
    records,
    pagination,
    onPageChange,
    onExport
}) => {
    const [exportFormat, setExportFormat] = React.useState<'xlsx' | 'csv'>('csv');
    const [selectedColumns, setSelectedColumns] = React.useState<Set<string>>(new Set());
    const [isExportMenuOpen, setIsExportMenuOpen] = React.useState(false);
    const [isExporting, setIsExporting] = React.useState(false);

    // Extract columns from first record or default
    const availableColumns = React.useMemo(() => {
        return records.length > 0 && records[0].data ? Object.keys(records[0].data) : ['Name', 'City', 'State', 'Category'];
    }, [records]);

    // Initialize selected columns when modal opens or columns change
    React.useEffect(() => {
        if (isOpen && availableColumns.length > 0) {
            setSelectedColumns(new Set(availableColumns));
        }
    }, [isOpen, availableColumns]);

    if (!isOpen) return null;

    const handleExportClick = async () => {
        if (!onExport) return;
        setIsExporting(true);
        try {
            await onExport(exportFormat, Array.from(selectedColumns));
            setIsExportMenuOpen(false); // Close menu on success
        } catch (error) {
            console.error("Export failed", error);
        } finally {
            setIsExporting(false);
        }
    };

    const toggleColumn = (col: string) => {
        const newSet = new Set(selectedColumns);
        if (newSet.has(col)) {
            newSet.delete(col);
        } else {
            newSet.add(col);
        }
        setSelectedColumns(newSet);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-white w-full max-w-6xl h-[85vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col ring-1 ring-black/5 animate-in zoom-in-95 duration-300"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsExportMenuOpen(false); // Close dropdown if clicking outside
                }}
            >
                {/* Header */}
                <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 relative">
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

                    <div className="flex items-center gap-2">
                        {/* Export Button & Dropdown */}
                        {onExport && (
                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                                <button
                                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors flex items-center gap-2"
                                >
                                    {isExporting ? (
                                        <>
                                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Exporting...
                                        </>
                                    ) : (
                                        <>Export Data</>
                                    )}
                                </button>

                                {/* Export Menu */}
                                {isExportMenuOpen && (
                                    <div className="absolute top-full right-0 mt-2 w-[340px] bg-white rounded-2xl shadow-xl border border-slate-100 p-5 z-[50] animate-in fade-in zoom-in-95 duration-200">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Export Format</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        onClick={() => setExportFormat('csv')}
                                                        className={clsx(
                                                            "px-3 py-2 rounded-xl text-xs font-bold border transition-all",
                                                            exportFormat === 'csv'
                                                                ? "bg-slate-900 text-white border-slate-900"
                                                                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                                        )}
                                                    >
                                                        CSV (Fastest)
                                                    </button>
                                                    <button
                                                        onClick={() => setExportFormat('xlsx')}
                                                        className={clsx(
                                                            "px-3 py-2 rounded-xl text-xs font-bold border transition-all",
                                                            exportFormat === 'xlsx'
                                                                ? "bg-emerald-600 text-white border-emerald-600"
                                                                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                                        )}
                                                    >
                                                        Excel (.xlsx)
                                                    </button>
                                                </div>
                                                {pagination.total > 5000 && exportFormat === 'xlsx' && (
                                                    <p className="text-[10px] text-amber-600 font-bold mt-2 bg-amber-50 px-2 py-1 rounded-lg">
                                                        ⚠️ Large dataset (&gt;5k). CSV is recommended.
                                                    </p>
                                                )}
                                            </div>

                                            <div>
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Columns</label>
                                                    <button
                                                        onClick={() => setSelectedColumns(selectedColumns.size === availableColumns.length ? new Set() : new Set(availableColumns))}
                                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                                                    >
                                                        {selectedColumns.size === availableColumns.length ? 'Deselect All' : 'Select All'}
                                                    </button>
                                                </div>
                                                <div className="max-h-[150px] overflow-y-auto space-y-1 p-1">
                                                    {availableColumns.map(col => (
                                                        <label key={col} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                                                            <div className={clsx(
                                                                "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                                                                selectedColumns.has(col) ? "bg-indigo-600 border-indigo-600" : "border-slate-300 bg-white"
                                                            )}>
                                                                {selectedColumns.has(col) && <CheckIcon className="w-3 h-3 text-white" />}
                                                            </div>
                                                            <input
                                                                type="checkbox"
                                                                className="hidden"
                                                                checked={selectedColumns.has(col)}
                                                                onChange={() => toggleColumn(col)}
                                                            />
                                                            <span className="text-xs font-medium text-slate-700 truncate">{col}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            <button
                                                onClick={handleExportClick}
                                                disabled={isExporting || selectedColumns.size === 0}
                                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20"
                                            >
                                                {isExporting ? 'Preparing Download...' : `Download ${exportFormat.toUpperCase()}`}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden p-6 bg-slate-50 relative">
                    <DataGrid
                        records={records}
                        columns={availableColumns}
                        pagination={pagination}
                        onPageChange={onPageChange}
                    />
                </div>
            </div>
        </div>
    );
};

export default QueryResultModal;

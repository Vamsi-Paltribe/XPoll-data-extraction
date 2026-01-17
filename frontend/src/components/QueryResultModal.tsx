import { FC, useEffect, useMemo, useState } from 'react';
import { X, Database, Check as CheckIcon, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils';
import DataGrid from './DataGrid';
import { PaginatedResponse } from '../types';

interface QueryResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    queryPrompt: string;
    records: any[];
    pagination: PaginatedResponse<any>;
    onPageChange: (newPage: number) => void;
    onExport?: (format: 'xlsx' | 'csv', columns: string[]) => Promise<void>;
}

const ExportMenu = ({
    isOpen,
    onClose,
    availableColumns,
    onExport
}: {
    isOpen: boolean,
    onClose: () => void,
    availableColumns: string[],
    onExport: (format: 'xlsx' | 'csv', columns: string[]) => Promise<void>
}) => {
    const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('csv');
    const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(availableColumns));
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        setSelectedColumns(new Set(availableColumns));
    }, [availableColumns]);

    const handleExecute = async () => {
        setIsExporting(true);
        try {
            await onExport(exportFormat, Array.from(selectedColumns));
            onClose();
        } finally {
            setIsExporting(false);
        }
    };

    const toggleColumn = (col: string) => {
        const newSet = new Set(selectedColumns);
        if (newSet.has(col)) newSet.delete(col);
        else newSet.add(col);
        setSelectedColumns(newSet);
    };

    if (!isOpen) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute top-full right-0 mt-3 w-80 bg-white rounded-3xl shadow-2xl border border-[#EEEEEF] p-6 z-[50]"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="space-y-6">
                <div>
                    <label className="text-[9px] font-bold text-[#2D384A]/40 uppercase tracking-widest mb-3 block">File Architecture</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setExportFormat('csv')}
                            className={cn(
                                "px-3 py-3 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-2",
                                exportFormat === 'csv' ? "bg-[#2D384A] text-white border-[#2D384A]" : "bg-white text-[#2D384A]/60 border-[#EEEEEF] hover:border-[#2D384A]/20"
                            )}
                        >
                            <FileText className="w-3.5 h-3.5" /> CSV
                        </button>
                        <button
                            onClick={() => setExportFormat('xlsx')}
                            className={cn(
                                "px-3 py-3 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-2",
                                exportFormat === 'xlsx' ? "bg-[#A8328D] text-white border-[#A8328D]" : "bg-white text-[#2D384A]/60 border-[#EEEEEF] hover:border-[#2D384A]/20"
                            )}
                        >
                            <FileSpreadsheet className="w-3.5 h-3.5" /> EXCEL
                        </button>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-[9px] font-bold text-[#2D384A]/40 uppercase tracking-widest">Fields</label>
                        <button
                            onClick={() => setSelectedColumns(selectedColumns.size === availableColumns.length ? new Set() : new Set(availableColumns))}
                            className="text-[9px] font-bold text-[#A8328D] hover:underline uppercase"
                        >
                            {selectedColumns.size === availableColumns.length ? 'Clear' : 'Select All'}
                        </button>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                        {availableColumns.map(col => (
                            <label key={col} className="flex items-center gap-3 p-2 hover:bg-[#EEEEEF]/50 rounded-xl cursor-pointer group transition-colors">
                                <div className={cn(
                                    "w-4 h-4 rounded-md border flex items-center justify-center transition-all",
                                    selectedColumns.has(col) ? "bg-[#2D384A] border-[#2D384A]" : "border-[#EEEEEF] bg-white group-hover:border-[#2D384A]/30"
                                )}>
                                    {selectedColumns.has(col) && <CheckIcon className="w-2.5 h-2.5 text-white" />}
                                </div>
                                <input type="checkbox" className="hidden" checked={selectedColumns.has(col)} onChange={() => toggleColumn(col)} />
                                <span className="text-xs font-bold text-[#2D384A]/70 truncate uppercase tracking-tight">{col.replace(/_/g, ' ')}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <button
                    onClick={handleExecute}
                    disabled={isExporting || selectedColumns.size === 0}
                    className="w-full py-4 bg-[#2D384A] hover:bg-[#A8328D] disabled:opacity-20 text-white rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-xl shadow-[#2D384A]/10"
                >
                    {isExporting ? 'Transmitting...' : 'Execute Export'}
                </button>
            </div>
        </motion.div>
    );
};

const QueryResultModal: FC<QueryResultModalProps> = ({
    isOpen,
    onClose,
    queryPrompt,
    records,
    pagination,
    onPageChange,
    onExport
}) => {
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

    const availableColumns = useMemo(() => {
        return records.length > 0 && records[0].data ? Object.keys(records[0].data) : ['Name', 'City', 'State', 'Category'];
    }, [records]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 sm:p-8 bg-[#2D384A]/60 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-[#EEEEEF] p-1 w-full max-w-7xl h-[90vh] rounded-[40px] shadow-3xl border border-white/20 overflow-hidden flex flex-col"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsExportMenuOpen(false);
                }}
            >
                <div className="bg-white h-full rounded-[38px] flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="px-10 py-6 border-b border-[#EEEEEF] flex justify-between items-center bg-white shrink-0">
                        <div className="flex items-center gap-5">
                            <div className="p-3 bg-[#2D384A]/5 rounded-2xl text-[#2D384A]">
                                <Database className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-[#2D384A]/40 uppercase tracking-[0.2em] mb-0.5">Dataset Extraction</p>
                                <h2 className="text-xl font-bold text-[#2D384A] truncate max-w-xl" title={queryPrompt}>
                                    {queryPrompt}
                                </h2>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {onExport && (
                                <div className="relative" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                                        className="px-6 py-3.5 bg-[#2D384A] text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#A8328D] hover:text-white transition-all flex items-center gap-3 border border-transparent active:scale-95"
                                    >
                                        <Download className="w-4 h-4" />
                                        Export
                                    </button>

                                    <AnimatePresence>
                                        {isExportMenuOpen && (
                                            <ExportMenu
                                                isOpen={isExportMenuOpen}
                                                onClose={() => setIsExportMenuOpen(false)}
                                                availableColumns={availableColumns}
                                                onExport={onExport}
                                            />
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            <button
                                onClick={onClose}
                                className="p-3 hover:bg-[#EEEEEF] rounded-2xl transition-all text-[#2D384A]/30 hover:text-[#2D384A]"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Content Section */}
                    <div className="flex-1 overflow-hidden p-8 bg-[#fcfcfc] relative">
                        <div className="h-full rounded-[24px] border border-[#EEEEEF] bg-white shadow-inner overflow-hidden">
                            <DataGrid
                                records={records}
                                columns={availableColumns}
                                pagination={pagination as any}
                                onPageChange={onPageChange}
                            />
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default QueryResultModal;

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { UploadCloud } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Job, Message } from '../types';
import { useAgent, useJobs } from '../hooks';

import {
    ConsoleHeader,
    ChatWindow,
    ChatInput,
    JobHistory
} from './agent';

// Lazy Components
const ReviewExtractionModal = lazy(() => import('./ReviewExtractionModal'));
const QueryResultModal = lazy(() => import('./QueryResultModal'));

const toastHelper = {
    success: (msg: string) => console.log('Items Success:', msg),
    error: (msg: string) => console.error('Items Error:', msg)
};

interface AgentConsoleProps {
    bucketId?: string;
    initialFile?: File | null;
}

const AgentConsole = ({ bucketId, initialFile }: AgentConsoleProps) => {
    // Basic Chat State
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'init',
            type: 'system',
            content: "I am ready. Drag & Drop files to extract data, or type a query.",
            suggestions: ["Show records from Arizona", "Export flagged rows", "Analyze voter distribution"]
        }
    ]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showHistory, setShowHistory] = useState(false);

    const [queryModalOpen, setQueryModalOpen] = useState(false);
    const [queryModalData, setQueryModalData] = useState<{ records: any[], pagination: any, prompt: string }>({
        records: [],
        pagination: { total: 0, page: 1, limit: 20, pages: 1 },
        prompt: ''
    });

    // Job Review State (Local)
    const [selectedReviewJob, setSelectedReviewJob] = useState<Job | null>(null);

    // --- Hooks ---
    const { uploadFile, queryData } = useAgent(bucketId);
    const { jobs: allJobs, approveJob, rejectJob, fetchNextPage, hasNextPage, isFetchingNextPage } = useJobs(bucketId);

    // Infinite Scroll Observer
    const loadMoreRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasNextPage) {
                    fetchNextPage();
                }
            },
            { threshold: 0.1 }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => observer.disconnect();
    }, [hasNextPage, fetchNextPage, showHistory]);

    // Logic: Scroll to bottom on new message
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    useEffect(() => {
        if (!showHistory) {
            scrollToBottom();
        }
    }, [messages, showHistory]);

    // Logic: Handle initial file drop from parent or reload
    useEffect(() => {
        if (initialFile) {
            handleSend(`Ingest ${initialFile.name}`, initialFile);
        }
    }, [initialFile]);

    const calculateCost = (file: File | null) => {
        if (!file) return 0;
        const sizeMB = file.size / (1024 * 1024);
        return Math.ceil(10 + (sizeMB * 5));
    };

    // Main Interaction Handler
    const handleSend = async (textOverride?: string, file?: File) => {
        const text = textOverride || input;
        if (!text.trim() && !file) return;

        // 1. Add User Message
        const userMsg: Message = {
            id: Date.now().toString(),
            type: 'user',
            content: text,
            file: file
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');

        // 2. Clear File Input Ref if used
        if (fileInputRef.current) fileInputRef.current.value = '';

        setIsProcessing(true);

        if (file && bucketId) {
            // --- FILE UPLOAD FLOW ---
            const cost = calculateCost(file);
            setMessages(prev => [...prev, {
                id: `sys_loading_${Date.now()}`,
                type: 'system',
                isLoading: true,
                content: `Ingesting ${file.name} (Est. ${cost} tokens)...`
            }]);

            try {
                const prompt = text.replace(`Ingest ${file.name}`, '').trim() || "Extract data";
                const res = await uploadFile.mutateAsync({ file, prompt });

                setMessages(prev => prev.filter(m => !m.isLoading).concat({
                    id: `sys_job_${Date.now()}`,
                    type: 'system',
                    jobId: res.jobId,
                    content: (
                        <div className="flex flex-col gap-1">
                            <span>Ingestion started for <b>{file.name}</b>.</span>
                            <span className="opacity-70 text-xs">Processing in background...</span>
                        </div>
                    )
                }));
            } catch (err: any) {
                setMessages(prev => prev.filter(m => !m.isLoading).concat({
                    id: `sys_err_${Date.now()}`,
                    type: 'system',
                    isError: true,
                    content: `❌ Upload Failed: ${err.response?.data?.error || err.message}`
                }));
            } finally {
                setIsProcessing(false);
            }

        } else {
            // --- Chat-to-Query Logic ---
            const userPrompt = text;
            setMessages(prev => [...prev, {
                id: `sys_loading_${Date.now()}`,
                type: 'system',
                isLoading: true,
                content: `Searching database for "${userPrompt}"...`
            }]);

            try {
                const res = await queryData.mutateAsync({ prompt: userPrompt });

                setMessages(prev => {
                    const filtered = prev.filter(m => !m.isLoading);
                    const { data, summary, pagination } = res;

                    let contentText = '';
                    if (summary) {
                        contentText = `Found **${summary.value}** matching records.`;
                    } else if (data.length > 0) {
                        contentText = `Found **${pagination.total}** records matching your request.`;
                    } else {
                        contentText = `I couldn't find any records matching "${userPrompt}".`;
                    }

                    return [...filtered, {
                        id: `sys_query_${Date.now()}`,
                        type: 'system',
                        content: contentText,
                        queryResult: {
                            summary,
                            data,
                            pagination,
                            prompt: userPrompt
                        }
                    }];
                });

            } catch (err: any) {
                setMessages(prev => {
                    const filtered = prev.filter(m => !m.isLoading);
                    return [...filtered, {
                        id: `sys_err_${Date.now()}`,
                        type: 'system',
                        isError: true,
                        content: `❌ Query Failed: ${err.response?.data?.error || err.message}`
                    }];
                });
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const handleQueryExport = async (format: 'xlsx' | 'csv', columns: string[]) => {
        if (!queryModalData.prompt || !bucketId) return;

        try {
            toastHelper.success("Starting export...");
            const res = await queryData.mutateAsync({
                prompt: queryModalData.prompt,
                page: 1,
                limit: 10000
            });

            const rows = res.data;
            if (!rows || rows.length === 0) {
                toastHelper.error("No data to export");
                return;
            }

            const exportData = rows.map((r: any) => {
                const flatRow: any = {};
                columns.forEach(col => {
                    flatRow[col] = r.data?.[col] || '';
                });
                return flatRow;
            });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const fileName = `query_results_${timestamp}`;

            if (format === 'csv') {
                const headers = columns.join(',');
                const csvRows = exportData.map((row: any) =>
                    columns.map(col => {
                        const cell = row[col] === null || row[col] === undefined ? '' : String(row[col]);
                        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
                            return `"${cell.replace(/"/g, '""')}"`;
                        }
                        return cell;
                    }).join(',')
                );
                const csvContent = [headers, ...csvRows].join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", `${fileName}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                const worksheet = XLSX.utils.json_to_sheet(exportData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Query Results");
                XLSX.writeFile(workbook, `${fileName}.xlsx`);
            }

            toastHelper.success(`Exported ${rows.length} records`);

        } catch (err) {
            console.error("Export Error", err);
            toastHelper.error("Failed to export data");
        }
    };

    const handleQueryPageChange = async (newPage: number) => {
        if (!queryModalData.prompt) return;
        try {
            const res = await queryData.mutateAsync({
                prompt: queryModalData.prompt,
                page: newPage,
                limit: 20
            });
            setQueryModalData(prev => ({
                ...prev,
                records: res.data,
                pagination: res.pagination
            }));
        } catch (err) {
            console.error("Failed to load page");
        }
    };

    // Drag & Drop Handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };
    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            handleSend(`Ingest ${file.name}`, file);
        }
    };
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            handleSend(`Ingest ${file.name}`, file);
        }
    };


    return (
        <div
            className="h-full flex flex-col bg-white rounded-[32px] shadow-[0px_4px_30px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden relative"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drag Overlay */}
            {isDragOver && (
                <div className="absolute inset-0 z-50 bg-[#2D384A]/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in text-white">
                    <UploadCloud size={64} className="mb-4 animate-bounce" />
                    <h3 className="text-2xl font-bold">Drop to Ingest</h3>
                    <p className="opacity-80">Release to start extraction job</p>
                </div>
            )}

            {/* Console Header */}
            <ConsoleHeader
                showHistory={showHistory}
                setShowHistory={setShowHistory}
                hasWaitingJobs={allJobs?.some(j => j.status === 'waiting_approval') || false}
            />

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
                {!showHistory ? (
                    <>
                        <ChatWindow
                            messages={messages}
                            allJobs={allJobs}
                            messagesEndRef={messagesEndRef}
                            onReviewJob={setSelectedReviewJob}
                            onViewData={(records, pagination, prompt) => {
                                setQueryModalData({ records, pagination, prompt });
                                setQueryModalOpen(true);
                            }}
                            onSuggestionClick={handleSend}
                            isProcessing={isProcessing}
                        />
                        <ChatInput
                            input={input}
                            setInput={setInput}
                            onSend={handleSend}
                            fileInputRef={fileInputRef}
                            onFileSelect={handleFileSelect}
                            isProcessing={isProcessing}
                        />
                    </>
                ) : (
                    <JobHistory
                        allJobs={allJobs}
                        onReviewJob={setSelectedReviewJob}
                        loadMoreRef={loadMoreRef}
                        hasNextPage={hasNextPage}
                        isFetchingNextPage={isFetchingNextPage}
                    />
                )}
            </div>

            {/* Modals */}
            <Suspense fallback={null}>
                {selectedReviewJob && (
                    <ReviewExtractionModal
                        job={selectedReviewJob}
                        onClose={() => setSelectedReviewJob(null)}
                        onApprove={(id) => {
                            approveJob.mutate({ jobId: id }, {
                                onSuccess: () => {
                                    setMessages(prev => [...prev, {
                                        id: `sys_conf_${Date.now()}`,
                                        type: 'system',
                                        content: "✅ Records committed successfully. The bucket has been updated."
                                    }]);
                                    setSelectedReviewJob(null);
                                }
                            });
                        }}
                        onReject={(id) => {
                            rejectJob.mutate(id, {
                                onSuccess: () => {
                                    setMessages(prev => [...prev, {
                                        id: `sys_rej_${Date.now()}`,
                                        type: 'system',
                                        content: "❌ Job discarded. No data was changed."
                                    }]);
                                    setSelectedReviewJob(null);
                                }
                            });
                        }}
                        isProcessing={approveJob.isPending || rejectJob.isPending}
                    />
                )}
                {queryModalOpen && (
                    <QueryResultModal
                        isOpen={queryModalOpen}
                        onClose={() => setQueryModalOpen(false)}
                        records={queryModalData.records}
                        pagination={queryModalData.pagination}
                        queryPrompt={queryModalData.prompt}
                        onExport={handleQueryExport}
                        onPageChange={handleQueryPageChange}
                    />
                )}
            </Suspense>
        </div>
    );
};

export default AgentConsole;

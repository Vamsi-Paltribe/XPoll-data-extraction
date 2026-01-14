import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
    Bot,
    Sparkles,
    UploadCloud,
    ArrowUp,
    FileText,
    Eye,
    Paperclip,
    CheckCircle,
    Database,
    Hash,
    Search,
    Loader2
} from 'lucide-react';
import clsx from 'clsx';
import { useQueryClient, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import api from '../services/api';

import * as XLSX from 'xlsx';

// Lazy Components
const ReviewExtractionModal = lazy(() => import('./ReviewExtractionModal'));
const QueryResultModal = lazy(() => import('./QueryResultModal'));

const toastHelper = {
    success: (msg: string) => console.log('Items Success:', msg),
    error: (msg: string) => console.error('Items Error:', msg)
};

interface AgentConsoleProps {
    bucketId?: string;
    userTokens?: number;
    initialFile?: File | null;
}

interface Message {
    id: string;
    type: 'user' | 'system';
    content: React.ReactNode;
    file?: File;
    isLoading?: boolean;
    isError?: boolean;
    jobId?: string;
    suggestions?: string[];
    queryResult?: {
        summary: { type: 'stat', value: any, label: string } | null;
        data: any[];
        pagination: any;
        prompt: string;
    };
}

interface Job {
    _id: string;
    originalName: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'waiting_approval' | 'rejected' | 'paused';
    result?: any;
    createdAt: string;
    tokensConsumed?: number;
    error?: string;
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
    const queryClient = useQueryClient();

    const {
        data: jobsData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useInfiniteQuery({
        queryKey: ['jobs-infinite', bucketId],
        queryFn: async ({ pageParam = 1 }) => {
            if (!bucketId) return { jobs: [], pagination: { total: 0, page: 1, limit: 20, pages: 0 } };
            const res = await api.get<{ jobs: Job[], pagination: any } | Job[]>(`/jobs/bucket/${bucketId}?page=${pageParam}&limit=20`);

            // Handle legacy array response
            if (Array.isArray(res.data)) {
                return {
                    jobs: res.data,
                    pagination: { total: res.data.length, page: 1, limit: 1000, pages: 1 }
                };
            }
            return res.data;
        },
        getNextPageParam: (lastPage) => {
            if (!lastPage || !lastPage.pagination) return undefined;
            const { page, pages } = lastPage.pagination;
            return page < pages ? page + 1 : undefined;
        },
        enabled: !!bucketId,
        refetchInterval: 5000,
        initialPageParam: 1
    });

    const allJobs = jobsData?.pages.flatMap(page => page.jobs) || [];

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
    }, [hasNextPage, fetchNextPage, showHistory]); // Add showHistory to re-attach when tab changes

    // Mutations
    const approveMutation = useMutation({
        mutationFn: async (jobId: string) => api.post(`/jobs/${jobId}/approve`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobs-infinite', bucketId] });
            queryClient.invalidateQueries({ queryKey: ['bucket-jobs', bucketId] });
            queryClient.invalidateQueries({ queryKey: ['registry-customers', bucketId] }); // Refresh parent data too
            toastHelper.success('Job approved');
            setMessages(prev => [...prev, {
                id: `sys_conf_${Date.now()}`,
                type: 'system',
                content: "✅ Records committed successfully. The bucket has been updated."
            }]);
            setSelectedReviewJob(null);
        },
        onError: (err: any) => {
            window.alert('Failed to approve: ' + (err.response?.data?.error || err.message));
        }
    });

    // --- DYNAMIC SUGGESTIONS ---
    const { data: suggestionRecords } = useQuery({
        queryKey: ['suggestion-records', bucketId],
        queryFn: async () => {
            if (!bucketId) return [];
            const res = await api.get(`/buckets/${bucketId}/customer?limit=3`);
            return res.data.data || [];
        },
        enabled: !!bucketId
    });

    useEffect(() => {
        if (suggestionRecords && suggestionRecords.length > 0) {
            const dynamicSuggestions: string[] = [];

            // Suggestion 1: Find [Name]
            const rec1 = suggestionRecords[0]?.data;
            if (rec1) {
                const name = rec1.Name || rec1.name || rec1['full name'] || rec1['Full_Name'];
                if (name) dynamicSuggestions.push(`Find ${name}`);
            }

            // Suggestion 2: Details for ID [ID]
            const rec2 = (suggestionRecords[1] || suggestionRecords[0])?.data;
            if (rec2) {
                const id = rec2.id || rec2.ID || rec2['contribution id'];
                if (id) dynamicSuggestions.push(`Details for ID ${id}`);
            }

            // Suggestion 3: Records in [State/City]
            const rec3 = (suggestionRecords[2] || suggestionRecords[0])?.data;
            if (rec3) {
                const location = rec3.State || rec3.City || rec3.city;
                if (location) dynamicSuggestions.push(`Show records from ${location}`);
            }

            if (dynamicSuggestions.length > 0) {
                setMessages(prev => prev.map(m =>
                    m.id === 'init' ? { ...m, suggestions: dynamicSuggestions } : m
                ));
            }
        }
    }, [suggestionRecords]);

    const rejectMutation = useMutation({
        mutationFn: async (jobId: string) => api.post(`/jobs/${jobId}/reject`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobs-infinite', bucketId] });
            queryClient.invalidateQueries({ queryKey: ['bucket-jobs', bucketId] });
            setMessages(prev => [...prev, {
                id: `sys_rej_${Date.now()}`,
                type: 'system',
                content: "❌ Job discarded. No data was changed."
            }]);
            setSelectedReviewJob(null);
        }
    });



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
                // Determine prompt if any
                const prompt = text.replace(`Ingest ${file.name}`, '').trim() || "Extract data";

                const formData = new FormData();
                formData.append('file', file);
                formData.append('bucketId', bucketId);
                formData.append('prompt', prompt);

                const res = await api.post('/agent/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                // Update Loading Message -> Success Job Card
                setMessages(prev => prev.filter(m => !m.isLoading).concat({
                    id: `sys_job_${Date.now()}`,
                    type: 'system',
                    jobId: res.data.jobId, // Backend returns jobId, we use it to render card
                    content: (
                        <div className="flex flex-col gap-1">
                            <span>Ingestion started for <b>{file.name}</b>.</span>
                            <span className="opacity-70 text-xs">Processing in background...</span>
                        </div>
                    )
                }));

                queryClient.invalidateQueries({ queryKey: ['user-me'] });
                queryClient.invalidateQueries({ queryKey: ['jobs-infinite', bucketId] });
                queryClient.invalidateQueries({ queryKey: ['bucket-jobs', bucketId] });

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
                const res = await api.post('/agent/query', {
                    bucketId,
                    prompt: userPrompt,
                    page: 1,
                    limit: 20
                });

                setMessages(prev => {
                    const filtered = prev.filter(m => !m.isLoading);
                    const { data, summary, pagination } = res.data;

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
            // 1. Fetch ALL data (up to reasonable limit)
            const res = await api.post('/agent/query', {
                bucketId,
                prompt: queryModalData.prompt,
                page: 1,
                limit: 10000 // High limit for export
            });

            const rows = res.data.data;
            if (!rows || rows.length === 0) {
                toastHelper.error("No data to export");
                return;
            }

            // 2. Map data to flat structure based on columns
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
                // CSV Strategy: Manual string building for speed
                const headers = columns.join(',');
                const csvRows = exportData.map((row: any) =>
                    columns.map(col => {
                        const cell = row[col] === null || row[col] === undefined ? '' : String(row[col]);
                        // Escape quotes and wrap in quotes if contains comma
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
                // Excel Strategy: using xlsx
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
            const res = await api.post('/agent/query', {
                bucketId,
                prompt: queryModalData.prompt,
                page: newPage,
                limit: 20
            });
            setQueryModalData(prev => ({
                ...prev,
                records: res.data.data,
                pagination: res.data.pagination
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
            <div className="px-6 py-4 border-b border-slate-50 bg-white/80 backdrop-blur-md flex justify-between items-center z-10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#2D384A] rounded-lg flex items-center justify-center text-[#F7A25A]">
                        <Bot size={18} />
                    </div>
                    <span className="font-bold text-[#2D384A] text-sm">Agent Console</span>
                </div>
                <div className="flex bg-[#F8F9FA] p-1 rounded-xl">
                    <button
                        onClick={() => setShowHistory(false)}
                        className={clsx("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", !showHistory ? "bg-white shadow-sm text-[#2D384A]" : "text-slate-400 hover:text-slate-600")}
                    >
                        Chat
                    </button>
                    <button
                        onClick={() => setShowHistory(true)}
                        className={clsx("px-3 py-1.5 rounded-lg text-xs font-bold transition-all relative", showHistory ? "bg-white shadow-sm text-[#2D384A]" : "text-slate-400 hover:text-slate-600")}
                    >
                        Job History
                        {allJobs?.some(j => j.status === 'waiting_approval') && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-[#A8328D] rounded-full border border-white" />
                        )}
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
                {!showHistory ? (
                    // --- CHAT VIEW ---
                    <>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {messages.map((msg) => (
                                <div key={msg.id} className={clsx("flex flex-col gap-2", msg.type === 'user' ? "items-end" : "items-start")}>
                                    <div className={clsx(
                                        "max-w-[90%] p-4 text-sm font-medium shadow-sm transition-all animate-in zoom-in-95 duration-200",
                                        msg.type === 'user'
                                            ? "bg-[#2D384A] text-white rounded-[20px] rounded-tr-sm"
                                            : "bg-white border border-slate-100 text-[#2D384A] rounded-[20px] rounded-tl-sm",
                                        msg.isError && "border-red-200 bg-red-50 text-red-800"
                                    )}>
                                        {msg.file && (
                                            <div className="flex items-center gap-3 mb-3 p-3 bg-white/10 rounded-xl border border-white/10">
                                                <div className="w-8 h-8 bg-white text-[#2D384A] rounded-lg flex items-center justify-center">
                                                    <FileText size={16} />
                                                </div>
                                                <span className="text-xs font-bold truncate max-w-[200px]">{msg.file.name}</span>
                                            </div>
                                        )}
                                        {msg.queryResult && (
                                            <div className="mt-3">
                                                {/* Adaptive UI: Scenario A - Stat Card */}
                                                {msg.queryResult.summary && (
                                                    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 mb-3 flex items-center gap-4 w-fit shadow-sm">
                                                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md text-indigo-600">
                                                            <Hash className="w-6 h-6" />
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{msg.queryResult.summary.label}</p>
                                                            <p className="text-3xl font-black text-indigo-900">{msg.queryResult.summary.value.toLocaleString()}</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Adaptive UI: Scenario B - Mini List (Small sets) */}
                                                {/* {!msg.queryResult.summary && msg.queryResult.data && msg.queryResult.data.length > 0 && msg.queryResult.data.length <= 5 && (
                                                    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-md mb-4 w-full max-w-[320px]">
                                                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                            Quick Results
                                                        </div>
                                                        {msg.queryResult.data.map((rec: any, i: number) => (
                                                            <div key={i} className="px-4 py-3 border-b border-slate-50 last:border-none flex items-center gap-3 hover:bg-slate-50 transition-colors">
                                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs shadow-sm">
                                                                    {i + 1}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="font-bold text-slate-800 text-sm truncate">{rec.data?.Name || rec.data?.name || rec.data?.Full_Name || 'Record'}</p>
                                                                    <p className="text-xs text-slate-400 truncate opacity-80">{rec.data?.City || rec.data?.city || rec.data?.Account || 'Details Hidden'}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )} */}

                                                {/* Adaptive UI: Scenario C - Summary + Action (Large sets) */}
                                                {!msg.queryResult.summary && msg.queryResult.pagination && msg.queryResult.pagination.total > 5 && (
                                                    <div className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-lg mb-4 w-full max-w-[340px] flex flex-col gap-4 border-l-4 border-l-indigo-500">
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 shadow-sm">
                                                                <Database className="w-6 h-6" />
                                                            </div>
                                                            <div>
                                                                <p className="font-black text-slate-900 text-base">{msg.queryResult.pagination.total.toLocaleString()} Records</p>
                                                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Full Dataset Available</p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setQueryModalData({
                                                                    records: msg.queryResult!.data,
                                                                    pagination: msg.queryResult!.pagination,
                                                                    prompt: msg.queryResult!.prompt
                                                                });
                                                                setQueryModalOpen(true);
                                                            }}
                                                            className="w-full py-3 bg-[#2D384A] text-white rounded-xl text-xs font-black hover:bg-black transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-900/10 hover:scale-[1.02] active:scale-[0.98]"
                                                        >
                                                            <Search className="w-4 h-4" />
                                                            VIEW & EXPLORE DATA
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {msg.isLoading ? (
                                            <div className="flex items-center gap-3 py-1">
                                                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                                                <span className="opacity-70">{msg.content}</span>
                                            </div>
                                        ) : (
                                            <>
                                                {msg.queryResult && (
                                                    <div className="mt-3">
                                                        {/* SCENARIO A: SINGLE RECORD HIGHLIGHT (1-to-1 Answer) */}
                                                        {!msg.queryResult.summary && msg.queryResult.data?.length === 1 && (
                                                            <div
                                                                onClick={() => {
                                                                    setQueryModalData({
                                                                        records: msg.queryResult!.data,
                                                                        pagination: msg.queryResult!.pagination,
                                                                        prompt: msg.queryResult!.prompt
                                                                    });
                                                                    setQueryModalOpen(true);
                                                                }}
                                                                className="bg-white border-2 border-indigo-100 rounded-[28px] p-6 mb-4 w-full max-w-[360px] shadow-xl shadow-indigo-500/5 cursor-pointer hover:border-indigo-300 transition-all group relative overflow-hidden"
                                                            >
                                                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                                                    <Database size={64} className="text-indigo-600" />
                                                                </div>

                                                                <div className="flex items-center gap-4 mb-5">
                                                                    <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                                                                        <Hash className="w-7 h-7" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Found Exact Match</p>
                                                                        <h4 className="text-lg font-black text-slate-900 leading-tight">
                                                                            {msg.queryResult.data[0].data?.Name || msg.queryResult.data[0].data?.name || msg.queryResult.data[0].data?.Full_Name || 'Record Found'}
                                                                        </h4>
                                                                    </div>
                                                                </div>

                                                                <div className="space-y-3 mb-5">
                                                                    {Object.entries(msg.queryResult.data[0].data || {}).slice(0, 3).map(([key, val]: [string, any], idx) => (
                                                                        <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-none">
                                                                            <span className="text-[10px] font-bold text-slate-400 uppercase">{key.replace(/_/g, ' ')}</span>
                                                                            <span className="text-xs font-black text-slate-700 truncate max-w-[180px]">{String(val)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                <button className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black tracking-widest uppercase hover:bg-black transition-all flex items-center justify-center gap-2">
                                                                    <Search className="w-4 h-4" />
                                                                    View Full Detailed Profile
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* SCENARIO B: MINI LIST (Small Collection 2-5) */}
                                                        {!msg.queryResult.summary && msg.queryResult.data && msg.queryResult.data.length > 1 && msg.queryResult.data.length <= 5 && (
                                                            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-md mb-4 w-full max-w-[320px]">
                                                                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Small Collection ({msg.queryResult.data.length})</span>
                                                                    <span className="text-[10px] font-bold text-indigo-500 animate-pulse">Click to explore</span>
                                                                </div>
                                                                {msg.queryResult.data.map((rec: any, i: number) => (
                                                                    <div
                                                                        key={i}
                                                                        onClick={() => {
                                                                            setQueryModalData({
                                                                                records: msg.queryResult!.data,
                                                                                pagination: msg.queryResult!.pagination,
                                                                                prompt: msg.queryResult!.prompt
                                                                            });
                                                                            setQueryModalOpen(true);
                                                                        }}
                                                                        className="px-4 py-3 border-b border-slate-50 last:border-none flex items-center gap-3 hover:bg-indigo-50 transition-colors cursor-pointer group"
                                                                    >
                                                                        <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-indigo-100 group-hover:text-indigo-600 flex items-center justify-center text-slate-500 font-bold text-xs shadow-sm transition-colors">
                                                                            {i + 1}
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="font-bold text-slate-800 text-sm truncate group-hover:text-indigo-900 transition-colors">{rec.data?.Name || rec.data?.name || rec.data?.Full_Name || 'Record'}</p>
                                                                            <p className="text-xs text-slate-400 truncate opacity-80">{rec.data?.City || rec.data?.city || rec.data?.Account || 'Details Hidden'}</p>
                                                                        </div>
                                                                        <Search className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* SCENARIO C: DATASET SUMMARY (Large Dataset > 5) */}
                                                        {!msg.queryResult.summary && msg.queryResult.pagination && msg.queryResult.pagination.total > 5 && (
                                                            <div className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-lg mb-4 w-full max-w-[340px] flex flex-col gap-4 border-l-4 border-l-indigo-500">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 shadow-sm">
                                                                        <Database className="w-6 h-6" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-black text-slate-900 text-base">{msg.queryResult.pagination.total.toLocaleString()} Records</p>
                                                                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Full Dataset Available</p>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        setQueryModalData({
                                                                            records: msg.queryResult!.data,
                                                                            pagination: msg.queryResult!.pagination,
                                                                            prompt: msg.queryResult!.prompt
                                                                        });
                                                                        setQueryModalOpen(true);
                                                                    }}
                                                                    className="w-full py-3 bg-[#2D384A] text-white rounded-xl text-xs font-black hover:bg-black transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-900/10 hover:scale-[1.02] active:scale-[0.98]"
                                                                >
                                                                    <Search className="w-4 h-4" />
                                                                    VIEW & EXPLORE DATA
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* SCENARIO D: AGGREGATE STAT (Stat Card) */}
                                                        {msg.queryResult.summary && (
                                                            <div
                                                                onClick={() => {
                                                                    setQueryModalData({
                                                                        records: msg.queryResult!.data,
                                                                        pagination: msg.queryResult!.pagination,
                                                                        prompt: msg.queryResult!.prompt
                                                                    });
                                                                    setQueryModalOpen(true);
                                                                }}
                                                                className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 mb-3 flex items-center gap-4 w-fit shadow-sm hover:shadow-md hover:bg-indigo-100 transition-all cursor-pointer group"
                                                            >
                                                                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md text-indigo-600 group-hover:scale-110 transition-transform">
                                                                    <Hash className="w-6 h-6" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{msg.queryResult.summary.label}</p>
                                                                    <p className="text-3xl font-black text-indigo-900">{msg.queryResult.summary.value.toLocaleString()}</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {msg.content}
                                            </>
                                        )}
                                    </div>

                                    {/* Embedded Job Card */}
                                    {msg.jobId && allJobs && (
                                        (() => {
                                            const job = allJobs.find(j => j._id === msg.jobId);
                                            if (!job) return null;

                                            return (
                                                <div className="ml-1 mt-2 bg-[#F8F9FA] rounded-[24px] p-5 border border-slate-100 flex flex-col gap-3 w-[280px] shadow-sm animate-in slide-up">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[120px]">{job.originalName}</span>
                                                        <span className={clsx(
                                                            "text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wide",
                                                            job.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                                                                job.status === 'waiting_approval' ? "bg-[#A8328D]/10 text-[#A8328D]" :
                                                                    job.status === 'failed' ? "bg-red-100 text-red-700" :
                                                                        "bg-blue-100 text-blue-700"
                                                        )}>
                                                            {job.status.replace('_', ' ')}
                                                        </span>
                                                    </div>

                                                    {job.status === 'waiting_approval' && (
                                                        <div className="flex items-center justify-between mt-1">
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-bold text-[#2D384A]">Ready</span>
                                                                <span className="text-[10px] text-slate-400">Review Data</span>
                                                            </div>
                                                            <button
                                                                onClick={() => setSelectedReviewJob(job)}
                                                                className="px-4 py-2 bg-[#2D384A] text-white text-xs font-bold rounded-xl hover:bg-[#1a202c] transition-colors flex items-center gap-2 shadow-lg shadow-[#2D384A]/10"
                                                            >
                                                                <Eye size={14} /> Review
                                                            </button>
                                                        </div>
                                                    )}
                                                    {job.status === 'completed' && (
                                                        <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs mt-1">
                                                            <CheckCircle size={14} /> Completed
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()
                                    )}

                                    {msg.suggestions && (
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {msg.suggestions.map((s, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => handleSend(s)}
                                                    className="px-3 py-1.5 bg-[#F8F9FA] border border-slate-100 rounded-full text-xs text-[#A8328D] font-bold hover:bg-[#A8328D] hover:text-white transition-all"
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {isProcessing && (
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 animate-pulse pl-4">
                                    <Sparkles size={14} /> Agent is thinking...
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Unified Input */}
                        <div className="p-4 bg-white border-t border-slate-50 relative">
                            <div className="relative shadow-lg shadow-slate-200/50 rounded-[24px] bg-[#F8F9FA] border border-slate-100 overflow-hidden focus-within:ring-2 focus-within:ring-[#A8328D]/10 transition-all">
                                <textarea
                                    className="w-full pl-12 pr-14 py-4 bg-transparent text-sm font-medium text-[#2D384A] placeholder:text-slate-400 outline-none resize-none h-[60px] flex items-center"
                                    placeholder="Type a query or drop a file..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                />

                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute left-3 top-3 p-2 text-slate-400 hover:text-[#2D384A] hover:bg-white rounded-xl transition-all"
                                    title="Upload File"
                                >
                                    <Paperclip size={18} />
                                </button>
                                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />

                                <button
                                    onClick={() => handleSend()}
                                    disabled={!input.trim()}
                                    className="absolute right-3 top-3 p-2 bg-[#A8328D] text-white rounded-[14px] hover:bg-[#8e2a77] transition-all shadow-md shadow-[#A8328D]/20 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <ArrowUp size={18} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="h-full flex flex-col animate-in slide-in-from-right-2">
                        <div className="p-4 border-b border-slate-100 bg-white sticky top-0">
                            <h3 className="font-bold text-[#2D384A] text-xs uppercase tracking-widest text-center">Processing History</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                            {allJobs?.map(job => (
                                <div key={job._id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2 hover:shadow-md transition-all">
                                    <div className="flex justify-between items-start">
                                        <div className="font-bold text-[#2D384A] text-xs truncate max-w-[150px]">{job.originalName}</div>
                                        <span className={clsx(
                                            "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide",
                                            job.status === 'completed' ? "bg-emerald-50 text-emerald-600" :
                                                job.status === 'processing' ? "bg-blue-50 text-blue-600" :
                                                    job.status === 'failed' ? "bg-red-50 text-red-600" :
                                                        "bg-slate-100 text-slate-500"
                                        )}>
                                            {job.status}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                        {new Date(job.createdAt).toLocaleString()}
                                    </div>

                                    {job.status === 'waiting_approval' && (
                                        <button
                                            onClick={() => setSelectedReviewJob(job)}
                                            className="mt-1 w-[10rem] ml-auto py-1.5 bg-[#A8328D] text-white rounded-lg text-xs font-bold hover:bg-[#8e2a77] transition-all"
                                        >
                                            Review Now
                                        </button>
                                    )}
                                    {job.error && (
                                        <div className="text-[10px] text-red-500 font-medium bg-red-50 p-2 rounded-lg">
                                            {job.error}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {(!allJobs || allJobs.length === 0) && (
                                <div className="text-center py-10 text-slate-400 text-xs font-bold">No history found.</div>
                            )}

                            {/* Load More Trigger */}
                            {(hasNextPage || isFetchingNextPage) && (
                                <div ref={loadMoreRef} className="py-4 flex justify-center">
                                    {isFetchingNextPage && <Sparkles className="animate-spin text-slate-400" size={20} />}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Injection */}
            <Suspense fallback={null}>
                {selectedReviewJob && (
                    <div className="absolute inset-0 z-50">
                        <ReviewExtractionModal
                            job={selectedReviewJob}
                            onClose={() => setSelectedReviewJob(null)}
                            onApprove={(jobId: string) => {
                                approveMutation.mutate(jobId);
                            }}
                            onReject={(id: string) => rejectMutation.mutate(id)}
                            isProcessing={approveMutation.isPending || rejectMutation.isPending}
                        />
                    </div>
                )}
            </Suspense>

            <Suspense fallback={null}>
                {queryModalOpen && (
                    <QueryResultModal
                        isOpen={queryModalOpen}
                        onClose={() => setQueryModalOpen(false)}
                        queryPrompt={queryModalData.prompt}
                        records={queryModalData.records}
                        pagination={queryModalData.pagination}
                        onPageChange={handleQueryPageChange}
                        onExport={handleQueryExport}
                    />
                )}
            </Suspense>
        </div>
    );
};

export default AgentConsole;

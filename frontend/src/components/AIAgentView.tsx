
import { useState, useRef, useEffect, ChangeEvent, KeyboardEvent } from 'react';
import { Paperclip, XCircle, FileText, Loader2, Sparkles, Bot, ArrowUp, CheckCircle, XOctagon, Clock, Layers, Database, Hash, Search } from 'lucide-react';
import api from '../services/api';
import clsx from 'clsx';
import { useQueryClient, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import ReviewExtractionModal from './ReviewExtractionModal';
import QueryResultModal from './QueryResultModal';
import * as XLSX from 'xlsx';

interface AIAgentViewProps {
    bucketId?: string;
    userTokens?: number;
    initialFile?: File | null;
}

interface Message {
    type: 'user' | 'system';
    content: string;
    file?: File;
    isLoading?: boolean;
    isError?: boolean;
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

const AIAgentView = ({ bucketId, userTokens, initialFile }: AIAgentViewProps) => {
    const [messages, setMessages] = useState<Message[]>([]); // Start empty for clean landing page feel
    const [inputValue, setInputValue] = useState('');
    const [stagedFile, setStagedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [selectedReviewJob, setSelectedReviewJob] = useState<Job | null>(null);
    const [queryModalOpen, setQueryModalOpen] = useState(false);
    const [queryModalData, setQueryModalData] = useState<{ records: any[], pagination: any, prompt: string }>({
        records: [],
        pagination: { total: 0, page: 1, limit: 20, pages: 1 },
        prompt: ''
    });

    const queryClient = useQueryClient();

    useEffect(() => {
        if (initialFile) {
            setStagedFile(initialFile);
        }
    }, [initialFile]);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setStagedFile(e.dataTransfer.files[0]);
        }
    };

    // Auto-resize textarea1
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [inputValue]);

    // --- Job Queue Logic ---
    // --- Job Queue Logic ---
    const {
        data: jobsData
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

    const jobs = jobsData?.pages.flatMap(page => page.jobs) || [];




    const approveMutation = useMutation({
        mutationFn: async ({ jobId, manualState }: { jobId: string, manualState?: string }) => {
            await api.post(`/jobs/${jobId}/approve`, { manualState });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobs-infinite', bucketId] });
            queryClient.invalidateQueries({ queryKey: ['registry-customers', bucketId] });
            queryClient.invalidateQueries({ queryKey: ['user-me'] }); // Refresh tokens
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
            toast.success('Job approved and data committed successfully');
            setSelectedReviewJob(null);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error || 'Failed to approve job');
        }
    });

    const rejectMutation = useMutation({
        mutationFn: async (jobId: string) => {
            await api.post(`/jobs/${jobId}/reject`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobs-infinite', bucketId] });
            setSelectedReviewJob(null);
        }
    });
    // -----------------------

    const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setStagedFile(e.target.files[0]);
        }
    };

    const calculateCost = (file: File | null) => {
        if (!file) return 0;
        const sizeMB = file.size / (1024 * 1024);
        return Math.ceil(10 + (sizeMB * 5)); // Base 10 + 5 per MB
    };

    const handleSendMessage = async () => {
        if (!inputValue.trim() && !stagedFile) return;

        // Add User Message
        const userMsg: Message = {
            type: 'user',
            content: inputValue,
            file: stagedFile || undefined
        };
        setMessages(prev => [...prev, userMsg]);

        const currentFile = stagedFile;
        const currentPrompt = inputValue;

        // Reset Input
        setInputValue('');
        setStagedFile(null);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';

        if (currentFile && bucketId) {
            setUploading(true);
            const cost = calculateCost(currentFile);

            // Pre-flight Logic
            if (userTokens !== undefined && cost > userTokens) {
                setMessages(prev => [...prev, {
                    type: 'system',
                    isError: true,
                    content: `⚠️ **Insufficient Tokens**\n\nThis file requires approximately **${cost} tokens**, but you only have **${userTokens} tokens**.\n\nPlease recharge your wallet to continue.`
                }]);
                setUploading(false);
                return;
            }

            // Add Processing Message
            setMessages(prev => [...prev, {
                type: 'system',
                isLoading: true,
                content: `Analyzing ${currentFile.name} (Est. Cost: ${cost} tokens)...`
            }]);

            try {
                const formData = new FormData();
                formData.append('file', currentFile);
                formData.append('bucketId', bucketId);
                formData.append('prompt', currentPrompt);

                const res = await api.post('/agent/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                // Remove loading message and add success
                setMessages(prev => {
                    const filtered = prev.filter(m => !m.isLoading);
                    return [...filtered, {
                        type: 'system',
                        content: `✅ **Ingestion Started**\n\nFile: ` + '`' + currentFile.name + '`' + `\nJob ID: ` + '`' + res.data.jobId.slice(-6) + '`' + `\n\nI have queued this file for deep extraction using the specified parameters.`
                    }];
                });

                queryClient.invalidateQueries({ queryKey: ['user-me'] }); // Refresh global token balance

            } catch (err) {
                console.error("Agent Upload Error", err);
                const error = err as AxiosError<any>;
                const errorMessage = error.response?.data?.error || "Failed to process file.";

                setMessages(prev => {
                    const filtered = prev.filter(m => !m.isLoading);
                    return [...filtered, {
                        type: 'system',
                        isError: true,
                        content: `❌ Error: ${errorMessage}`
                    }];
                });
            } finally {
                setUploading(false);
            }
        } else {
            // --- Chat-to-Query Logic ---
            const userPrompt = currentPrompt;
            setMessages(prev => [...prev, {
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

                    let content = '';
                    if (summary) {
                        content = `Found **${summary.value}** matching records.`;
                    } else if (data.length > 0) {
                        content = `Found **${pagination.total}** records matching your request.`;
                    } else {
                        content = `I couldn't find any records matching "${userPrompt}".`;
                    }

                    return [...filtered, {
                        type: 'system',
                        content,
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
                        type: 'system',
                        isError: true,
                        content: `❌ Query Failed: ${err.response?.data?.error || err.message}`
                    }];
                });
            }
        }
    };

    const handleQueryExport = async (format: 'xlsx' | 'csv', columns: string[]) => {
        if (!queryModalData.prompt || !bucketId) return;

        try {
            toast.success("Starting export...");
            // 1. Fetch ALL data (up to reasonable limit)
            const res = await api.post('/agent/query', {
                bucketId,
                prompt: queryModalData.prompt,
                page: 1,
                limit: 10000 // High limit for export
            });

            const rows = res.data.data;
            if (!rows || rows.length === 0) {
                toast.error("No data to export");
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
                // Excel Strategy
                const worksheet = XLSX.utils.json_to_sheet(exportData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Query Results");
                XLSX.writeFile(workbook, `${fileName}.xlsx`);
            }

            toast.success(`Exported ${rows.length} records`);

        } catch (err) {
            console.error("Export Error", err);
            toast.error("Failed to export data");
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
            toast.error("Failed to load page");
        }
    };

    return (
        <div className="flex h-[calc(85dvh-8rem)] w-full relative gap-4">

            {/* Main Chat Area */}
            <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className="flex-1 flex flex-col relative h-full bg-white/50 rounded-3xl border border-white/60 shadow-sm backdrop-blur-xl overflow-hidden"
            >
                {/* Ambient Background (Optional) */}
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-50/50 to-white -z-10" />

                {/* Drag Overlay */}
                {dragActive && (
                    <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-300">
                        <div className="w-full max-w-lg bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200 p-12 flex flex-col items-center text-center shadow-2xl animate-in zoom-in-95 duration-300">
                            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-8">
                                <Paperclip className="w-10 h-10 text-purple-600 animate-bounce" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mb-3 uppercase tracking-tight">Drop files to extract</h2>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">PDF • CSV • XLSX • IMAGES • TXT</p>
                        </div>
                    </div>
                )}

                {/* Chat Area - Centered & Clean */}
                <div className="flex-1 overflow-y-auto w-full">
                    <div className="flex flex-col justify-start pt-10 pb-48 px-8 md:px-20 max-w-4xl mx-auto">

                        {messages.length === 0 && (
                            <div className="flex-1 flex flex-col items-center justify-center opacity-0 animate-in fade-in slide-in-from-bottom-8 duration-700 mt-20">
                                <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-6">
                                    <Bot className="w-8 h-8 text-slate-300" />
                                </div>
                                <h3 className="text-2xl font-bold text-slate-900 mb-2 text-center">How can I help you extract data today?</h3>
                                <p className="text-slate-400 text-sm font-medium text-center max-w-md">
                                    Upload PDFs, Excel sheets, or CSVs. I'll extract structured data, validate schemas, and sync to your registry.
                                </p>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <div key={idx} className={clsx("flex gap-6 mb-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-500 group", msg.type === 'user' ? "flex-row-reverse" : "flex-row")}>
                                {/* Avatar */}
                                <div className={clsx(
                                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
                                    msg.type === 'user' ? "bg-slate-900" : "bg-white border border-slate-200"
                                )}>
                                    {msg.type === 'user' ? (
                                        <span className="text-[10px] font-bold text-white">YOU</span>
                                    ) : (
                                        <Sparkles className="w-4 h-4 text-purple-600" />
                                    )}
                                </div>

                                {/* Content Bubble */}
                                <div className={clsx(
                                    "max-w-[80%] text-[15px] leading-7 font-medium",
                                    msg.type === 'system' ? "text-slate-600" : "text-slate-800"
                                )}>
                                    {msg.file && (
                                        <div className="flex items-center gap-4 mb-4 p-4 bg-slate-50 rounded-2xl border border-slate-200/60 w-fit">
                                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-200 shadow-sm text-red-500">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900 text-sm">{msg.file.name}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{(msg.file.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                        </div>
                                    )}

                                    {msg.isLoading ? (
                                        <div className="flex items-center gap-3 text-slate-500">
                                            <span className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                                            </span>
                                            {msg.content}
                                        </div>
                                    ) : (
                                        <>
                                            {msg.queryResult && (
                                                <div className="mt-3">
                                                    {/* Adaptive UI: Scenario A - Stat Card */}
                                                    {msg.queryResult.summary && (
                                                        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 mb-3 flex items-center gap-4 w-fit">
                                                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-indigo-600">
                                                                <Hash className="w-6 h-6" />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">{msg.queryResult.summary.label}</p>
                                                                <p className="text-3xl font-black text-indigo-900">{msg.queryResult.summary.value.toLocaleString()}</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Adaptive UI: Scenario B - Mini List (Small sets) */}
                                                    {!msg.queryResult.summary && msg.queryResult.data && msg.queryResult.data.length > 0 && msg.queryResult.data.length <= 5 && (
                                                        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mb-3 max-w-md">
                                                            {msg.queryResult.data.map((rec: any, i: number) => (
                                                                <div key={i} className="px-4 py-3 border-b border-slate-50 last:border-none flex items-center gap-3 hover:bg-slate-50">
                                                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                                                                        {i + 1}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="font-bold text-slate-800 text-sm truncate">{rec.data?.Name || rec.data?.name || 'Record'}</p>
                                                                        <p className="text-xs text-slate-400 truncate">{rec.data?.City || rec.data?.city || 'Unknown City'}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Adaptive UI: Scenario C - Summary + Action (Large sets) */}
                                                    {!msg.queryResult.summary && msg.queryResult.pagination && msg.queryResult.pagination.total > 5 && (
                                                        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-3 max-w-sm">
                                                            <div className="flex items-center gap-3 mb-3">
                                                                <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                                                                    <Database className="w-5 h-5" />
                                                                </div>
                                                                <div>
                                                                    <p className="font-bold text-slate-900 text-sm">{msg.queryResult.pagination.total} Records Found</p>
                                                                    <p className="text-xs text-slate-400">Showing first {msg.queryResult.data.length}</p>
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
                                                                className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                                                            >
                                                                <Search className="w-3 h-3" />
                                                                View Full Results
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="whitespace-pre-wrap">{msg.content}</div>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input Area - Floating & Large */}
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent pt-20">
                    <div className="max-w-3xl mx-auto w-full relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-purple-200 to-pink-500 rounded-[2rem] opacity-20 group-focus-within:opacity-40 transition duration-500 blur"></div>
                        <div className="relative bg-white rounded-[1.75rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col overflow-hidden transition-all duration-300">

                            {/* Staged File Pill */}
                            {stagedFile && (
                                <div className="px-4 pt-4 animate-in slide-in-from-bottom-2">
                                    <div className="inline-flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200/60">
                                        <FileText className="w-4 h-4 text-slate-500" />
                                        <span className="text-xs font-bold text-slate-700 max-w-[150px] truncate">{stagedFile.name}</span>
                                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 uppercase tracking-wide">
                                            ~{calculateCost(stagedFile)} Credits
                                        </span>
                                        <button onClick={() => setStagedFile(null)} className="ml-1 p-0.5 hover:bg-slate-200 rounded-full transition-colors">
                                            <XCircle className="w-4 h-4 text-slate-400" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-end gap-2 p-2">
                                <label className="p-3 hover:bg-slate-50 rounded-full cursor-pointer transition-colors group/attach self-end mb-1">
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                                    <Paperclip className="w-5 h-5 text-slate-400 group-hover/attach:text-purple-600 transition-colors" />
                                </label>

                                <textarea
                                    ref={textareaRef}
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder="Describe your data or paste instructions here..."
                                    className="flex-1 max-h-[200px] min-h-[56px] py-4 bg-transparent border-none outline-none text-[15px] font-medium text-slate-700 placeholder:text-slate-400 resize-none font-sans leading-relaxed"
                                    rows={1}
                                />

                                <button
                                    onClick={handleSendMessage}
                                    disabled={(!inputValue && !stagedFile) || uploading}
                                    className={clsx(
                                        "p-3 rounded-full transition-all mb-1",
                                        (!inputValue && !stagedFile) || uploading
                                            ? "bg-slate-100 text-slate-300"
                                            : "bg-slate-900 text-white hover:bg-black hover:scale-110 shadow-lg shadow-slate-900/20"
                                    )}
                                >
                                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                        <p className="text-center text-[10px] font-bold text-slate-700 tracking-widest mt-4">
                            AI Agent can make mistakes. Verify important info.
                        </p>
                    </div>
                </div>
            </div>

            {/* Sidebar: Job Queue */}
            <div className="w-[350px] bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-400" />
                        Job History
                    </h3>
                    {/* Simple loading indicator if needed, though infinite query handles it differently */}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {jobs && jobs.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 text-sm">No jobs found</div>
                    ) : (
                        jobs?.map(job => (
                            <div key={job._id} className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                                <div className="flex justify-between items-start mb-2">
                                    <p className="font-bold text-slate-800 text-sm truncate max-w-[180px]" title={job.originalName}>{job.originalName}</p>
                                    <span className={clsx(
                                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                                        job.status === 'completed' ? "bg-green-100 text-green-700" :
                                            job.status === 'rejected' ? "bg-red-100 text-red-700" :
                                                job.status === 'failed' ? "bg-red-100 text-red-700" :
                                                    job.status === 'paused' ? "bg-orange-100 text-orange-700" :
                                                        job.status === 'waiting_approval' ? "bg-amber-100 text-amber-700 animate-pulse" :
                                                            job.status === 'processing' ? "bg-blue-100 text-blue-700" :
                                                                "bg-slate-100 text-slate-600"
                                    )}>
                                        {job.status === 'paused' ? 'Paused' : job.status.replace('_', ' ')}
                                    </span>
                                </div>

                                <p className="text-[11px] text-slate-400 mb-3">
                                    {new Date(job.createdAt).toLocaleString()}
                                </p>

                                {/* Actions for Waiting Approval */}
                                {job.status === 'waiting_approval' && (
                                    <div className="mt-3 space-y-3 pt-3 border-t border-slate-50">
                                        {/* Semantic Mapping Review */}
                                        {job.result?.detectedMapping && Object.keys(job.result.detectedMapping).length > 0 && (
                                            <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                                    <Layers className="w-3 h-3 text-slate-300" />
                                                    Synonym Match
                                                </p>
                                                <div className="space-y-1.5">
                                                    {Object.entries(job.result.detectedMapping).map(([source, target]: [string, any]) => (
                                                        <div key={source} className="flex items-center justify-between text-[11px]">
                                                            <span className="text-slate-500 truncate max-w-[100px]" title={source}>{source}</span>
                                                            <div className="h-[1px] flex-1 bg-slate-200 mx-2 border-dotted" />
                                                            <span className="font-bold text-slate-900">{target}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex flex-col gap-2">
                                            <button
                                                onClick={() => setSelectedReviewJob(job)}
                                                className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1"
                                            >
                                                <Layers className="w-3 h-3" />
                                                Review Extracted Data
                                            </button>

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => approveMutation.mutate({ jobId: job._id })}
                                                    disabled={approveMutation.isPending}
                                                    className="flex-1 py-2 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1"
                                                >
                                                    {approveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                                    Approve
                                                </button>
                                                <button
                                                    onClick={() => rejectMutation.mutate(job._id)}
                                                    disabled={rejectMutation.isPending}
                                                    className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1"
                                                >
                                                    <XOctagon className="w-3 h-3" />
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Error / Paused Message */}
                                {(job.status === 'failed' || job.status === 'paused') && (
                                    <div className={clsx(
                                        "mt-3 p-3 rounded-xl border text-[11px]",
                                        job.status === 'paused' ? "bg-orange-50 border-orange-100 text-orange-700" : "bg-red-50 border-red-100 text-red-700"
                                    )}>
                                        <div className="flex items-center gap-1 font-bold mb-1">
                                            <XCircle className="w-3 h-3" />
                                            {job.status === 'paused' ? 'Action Required' : 'Extraction Error'}
                                        </div>
                                        <p className="opacity-90 leading-relaxed">
                                            {job.result?.error || job.error || "Unknown error occurred."}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {
                selectedReviewJob && (
                    <ReviewExtractionModal
                        job={selectedReviewJob}
                        onClose={() => setSelectedReviewJob(null)}
                        onApprove={(jobId: string, options?: { manualState?: string }) => {
                            approveMutation.mutate({ jobId, ...options });
                        }}
                        onReject={(id: string) => rejectMutation.mutate(id)}
                        isProcessing={approveMutation.isPending || rejectMutation.isPending}
                    />
                )
            }

            <QueryResultModal
                isOpen={queryModalOpen}
                onClose={() => setQueryModalOpen(false)}
                queryPrompt={queryModalData.prompt}
                records={queryModalData.records}
                pagination={queryModalData.pagination}
                onPageChange={handleQueryPageChange}
                onExport={handleQueryExport}
            />
        </div >
    );
};

export default AIAgentView;

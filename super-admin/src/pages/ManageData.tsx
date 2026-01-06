import { useState, useRef } from 'react';
import { Upload, CheckCircle, XCircle, Loader2, Database, RefreshCw, Send, Paperclip, FileText, LayoutTemplate, MessageSquare, CheckCircle2, Clock, AlertCircle, ArrowRight } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import * as pdfjsLib from 'pdfjs-dist';

// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// 2. Assign the worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface ChatMessage {
    type: 'system' | 'user';
    content: string;
    file?: { name: string; size: number } | null;
    isProcessing?: boolean;
    isError?: boolean;
    isSuccess?: boolean;
    action?: string;
}

interface RegistryRecord {
    _id: string;
    bucketId: { name: string };
    data: any[] | any;
    createdAt: string;
}

interface PreviewData {
    tier: number;
    preview: Record<string, any[]>;
    summary: {
        states: {
            name: string;
            recordCount: number;
            sampleRecords: any[];
        }[];
    };
    logic?: any;
    signature?: string;
}
const STATUS_CONFIG = {
    completed: {
        color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        icon: <CheckCircle2 className="w-3 h-3" />,
        label: 'Completed'
    },
    processing: {
        color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
        label: 'Processing'
    },
    waiting_approval: {
        color: 'bg-amber-50 text-amber-700 border-amber-100',
        icon: <Clock className="w-3 h-3" />,
        label: 'Needs Review'
    },
    failed: {
        color: 'bg-rose-50 text-rose-700 border-rose-100',
        icon: <AlertCircle className="w-3 h-3" />,
        label: 'Failed'
    }
};

const ManageData = () => {
    // UI State
    const [activeTab, setActiveTab] = useState<'chat' | 'Bin' | 'registry'>('chat');
    const [inputValue, setInputValue] = useState('');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
        { type: 'system', content: 'Hello! I am your Data Assistant. Drag & drop a file (PDF, CSV, Excel, Image) or type instructions to get started.' }
    ]);
    const [stagedFile, setStagedFile] = useState<File | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Processing State
    const [uploading, setUploading] = useState(false);
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [committing, setCommitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveTemplate, setSaveTemplate] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const queryClient = useQueryClient();

    // Fetch Master Data
    const { data: masterData, isLoading: isLoadingMaster, refetch: refetchMaster } = useQuery<{ data: RegistryRecord[] }>({
        queryKey: ['master-data'],
        queryFn: async () => {
            const res = await api.get('/admin/data/master');
            return res.data;
        }
    });

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setStagedFile(e.target.files[0]);
        }
    };

    // --- JOB DASHBOARD LOGIC ---
    const { data: jobs, refetch: refetchJobs } = useQuery({
        queryKey: ['jobs'],
        queryFn: async () => {
            const res = await api.get('/jobs');
            return res.data;
        },
        refetchInterval: 5000 // Poll every 5s
    });

    const [activeJobId, setActiveJobId] = useState<string | null>(null);

    const handleReviewJob = async (job: any) => {
        if (!job.result) return;
        setActiveJobId(job._id);
        setPreviewData({
            tier: job.confidence > 0.8 ? 1 : 2, // Mock tier based on confidence
            preview: job.result,
            summary: {
                states: Object.entries(job.result).map(([name, records]: [string, any]) => ({
                    name,
                    recordCount: records.length,
                    sampleRecords: records.slice(0, 5)
                }))
            }
        });
    };

    // Override commit for Jobs
    const handleJobCommit = async () => {
        if (!activeJobId || !previewData) return;
        setCommitting(true);
        try {
            const res = await api.post(`/jobs/${activeJobId}/approve`, {
                extractedData: previewData.preview
            });

            setChatHistory(prev => [...prev, {
                type: 'system',
                content: `✅ Job approved. ${res.data.message}`,
                isSuccess: true
            }]);

            setPreviewData(null);
            setActiveJobId(null);
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
            queryClient.invalidateQueries({ queryKey: ['master-data'] });
        } catch (err: any) {
            setError(err.response?.data?.error || 'Approval failed.');
        } finally {
            setCommitting(false);
        }
    };
    // ---------------------------



    const handleSendMessage = async () => {
        if (!inputValue.trim() && !stagedFile) return;

        // Add User Message
        const userMsg: ChatMessage = {
            type: 'user',
            content: inputValue,
            file: stagedFile ? { name: stagedFile.name, size: stagedFile.size } : null
        };
        setChatHistory(prev => [...prev, userMsg]);

        const currentFile = stagedFile;

        setInputValue('');
        setStagedFile(null); // Clear stage

        if (currentFile) {
            await processFile(currentFile);
        } else {
            // Just text? For now, echo back. In future, could be a command.
            setTimeout(() => {
                setChatHistory(prev => [...prev, { type: 'system', content: "I see your message, but I currently only process files. Please attach a document!" }]);
            }, 500);
        }
    };

    const processFile = async (file: File) => {
        setUploading(true);
        const processingMsg: ChatMessage = { type: 'system', isProcessing: true, content: `Uploading & Processing ${file.name}...` };
        setChatHistory(prev => [...prev, processingMsg]);

        try {
            const formData = new FormData();
            formData.append('file', file);

            // Send to Backend S3 Upload & Queue
            const res = await api.post('/upload/image', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (res.data.success) {
                // Update Chat with Success
                setChatHistory(prev => {
                    const filtered = prev.filter(m => !m.isProcessing); // Remove processing msg
                    const successMsg: ChatMessage = {
                        type: 'system',
                        content: `Successfully uploaded ${file.name}. \n\nURL: ${res.data.url}\n\nIt has been queued for processing. \nCheck backend logs for worker output.`,
                        isSuccess: true
                    };
                    return [...filtered, successMsg];
                });
            } else {
                throw new Error("Upload failed");
            }

        } catch (err: any) {
            console.error("Processing Error:", err);
            setChatHistory(prev => {
                const filtered = prev.filter(m => !m.isProcessing);
                const errorMsg: ChatMessage = { type: 'system', isError: true, content: `Error: ${err.message || 'Failed to process file'}` };
                return [...filtered, errorMsg];
            });
        } finally {
            setUploading(false);
        }
    };

    const handleCommit = async () => {
        if (!previewData) return;

        // Delegate to Job Commit if active
        if (activeJobId) {
            await handleJobCommit();
            return;
        }

        setCommitting(true);
        try {
            const res = await api.post('/admin/upload-document/commit', {
                extractedData: previewData.preview,
                saveAsTemplate: saveTemplate,
                templateName: templateName,
                logic: previewData.tier === 0 ? null : (previewData.logic || null),
                signature: previewData.signature
            });

            // Success in Chat
            setChatHistory(prev => [...prev, {
                type: 'system',
                content: `✅ Committed ${res.data.insertedCount || 'data'} records to Global Registry.`,
                isSuccess: true
            }]);

            setPreviewData(null);
            queryClient.invalidateQueries({ queryKey: ['master-data'] }); // Refresh registry
        } catch (err) {
            setError(err.response?.data?.error || 'Commit failed.');
        } finally {
            setCommitting(false);
        }
    };

    // Redundant but necessary implementation for logic continuity...
    const [fallbackState, setFallbackState] = useState('');
    const [fallbackCity, setFallbackCity] = useState('');

    const handleApplyFallback = () => {
        if (!previewData || !previewData.preview['Unknown']) return;
        if (!fallbackState) {
            // Show error toast ideally
            return;
        }

        const unknownRecords = [...previewData.preview['Unknown']];
        const updatedRecords = unknownRecords.map(rec => ({
            ...rec,
            State: fallbackState.trim(),
            City: rec.City || fallbackCity.trim() || rec.City
        }));

        const newPreview = { ...previewData.preview };
        delete newPreview['Unknown'];

        const targetState = fallbackState.trim();
        if (newPreview[targetState]) {
            newPreview[targetState] = [...newPreview[targetState], ...updatedRecords];
        } else {
            newPreview[targetState] = updatedRecords;
        }

        setPreviewData({
            ...previewData,
            preview: newPreview,
            summary: {
                ...previewData.summary,
                states: Object.entries(newPreview).map(([name, records]) => ({
                    name,
                    recordCount: records.length,
                    sampleRecords: records.slice(0, 5)
                }))
            }
        });
        setFallbackState('');
        setFallbackCity('');
    };

    return (
        <div>
            <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all ${activeTab === 'chat' ? 'bg-black text-white shadow-lg shadow-black/20' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        <MessageSquare className="w-4 h-4" />
                        AI Extraction
                    </button>
                    <button
                        onClick={() => setActiveTab('Bin')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all ${activeTab === 'Bin' ? 'bg-black text-white shadow-lg shadow-black/20' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        <Upload className="w-4 h-4" />
                        Bin
                    </button>
                </div>
            </div>
            {/* Header Tabs */}

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">

                {/* 1. CHAT TAB - AGENTIC (RESTORED & REFINED) */}
                {activeTab === 'chat' && (
                    <div className="flex flex-col relative bg-slate-50 overflow-hidden ">
                        {/* Messages Area - Centered Column */}

                        {/* Ambient Background Effects */}
                        <div className="absolute top-10 right-0 w-[500px] h-[500px] bg-purple-200/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                        <div className="absolute bottom-10 left-0 w-[500px] h-[500px] bg-blue-200/20 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                        {/* Messages Area - Centered Column */}
                        <div className="flex-1 overflow-y-auto w-full scroll-smooth z-10 custom-scrollbar">
                            <div className="max-w-3xl mx-auto px-6 pb-[6rem] flex flex-col ">

                                {/* EMPTY STATE HERO */}
                                {chatHistory.length <= 1 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 p-10 opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-forwards">
                                        <div className="group relative">
                                            <div className="absolute inset-0 bg-gradient-to-tr from-purple-500 to-blue-500 rounded-[32px] blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
                                            <div className="relative w-24 h-24 bg-white/80 backdrop-blur-xl border border-white/60 rounded-[32px] shadow-2xl flex items-center justify-center ring-1 ring-white/50">
                                                <MessageSquare className="w-10 h-10 text-slate-800" />
                                            </div>
                                        </div>

                                        <div className="space-y-4 max-w-lg relative">
                                            <h2 className="text-4xl font-bold tracking-tight text-slate-900">
                                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600">Cortex</span> Data Agent
                                            </h2>
                                            <p className="text-lg text-slate-500 leading-relaxed font-medium">
                                                I can extract structured data from your documents regardless of format.
                                            </p>
                                        </div>

                                        {/* Suggestions / Shortcuts */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg mt-8">
                                            <button
                                                onClick={() => document.getElementById('file-upload-hidden').click()}
                                                className="p-5 bg-white/60 backdrop-blur-sm border border-white/60 hover:border-purple-200/60 rounded-3xl text-left shadow-lg shadow-slate-200/50 hover:shadow-xl hover:shadow-purple-500/10 transition-all duration-300 group"
                                            >
                                                <div className="mb-3 w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-50 to-white border border-purple-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <Upload className="w-5 h-5 text-purple-600" />
                                                </div>
                                                <p className="font-bold text-sm text-slate-900">Upload Document</p>
                                                <p className="text-xs text-slate-500 mt-1">PDF, Excel, CSV, or Image</p>
                                            </button>
                                            <div className="p-5 bg-white/40 border border-white/60 rounded-3xl text-left shadow-sm opacity-60 cursor-not-allowed grayscale">
                                                <div className="mb-3 w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 flex items-center justify-center">
                                                    <Database className="w-5 h-5 text-slate-400" />
                                                </div>
                                                <p className="font-bold text-sm text-slate-900">Connect Database</p>
                                                <p className="text-xs text-slate-400 mt-1">Coming soon...</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    // CHAT HISTORY
                                    <div className='h-[65dvh] space-y-4'>
                                        {chatHistory.map((msg, idx) => (
                                            <div key={idx} className={`flex gap-5 ${msg.type === 'user' ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>

                                                {/* AVATAR */}
                                                <div className={`w-9 h-9 rounded-2xl shrink-0 flex items-center justify-center shadow-md ${msg.type === 'user'
                                                    ? 'bg-slate-900 text-white'
                                                    : 'bg-gradient-to-br from-white to-slate-50 border border-white text-purple-600'
                                                    }`}>
                                                    {msg.type === 'user' ? <div className="text-[10px] font-bold tracking-wider">YOU</div> : <MessageSquare className="w-4 h-4" />}
                                                </div>

                                                {/* BUBBLE */}
                                                <div className={`max-w-[85%] rounded-3xl p-6 shadow-sm border ${msg.type === 'user'
                                                    ? 'bg-white border-slate-100 text-slate-800 rounded-tr-sm'
                                                    : msg.isError
                                                        ? 'bg-red-50/50 border-red-100 text-red-900 rounded-tl-sm backdrop-blur-sm'
                                                        : 'bg-white/60 border-white/60 backdrop-blur-md text-slate-800 rounded-tl-sm shadow-xl shadow-slate-200/20'
                                                    }`}>
                                                    {msg.file && (
                                                        <div className="flex items-center gap-3 mb-4 p-3 bg-white/50 rounded-2xl border border-white/50 shadow-sm group hover:bg-white/80 transition-colors">
                                                            <div className="w-10 h-10 bg-gradient-to-br from-purple-50 to-white rounded-xl flex items-center justify-center shadow-sm text-purple-600 border border-purple-50">
                                                                <FileText className="w-5 h-5" />
                                                            </div>
                                                            <div className="flex-1 min-w-0 pr-2">
                                                                <p className="font-bold text-sm text-slate-900 truncate">{msg.file.name}</p>
                                                                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{(msg.file.size / 1024).toFixed(1)} KB</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {msg.isProcessing && (
                                                        <div className="flex items-center gap-3 mb-3 p-2 bg-purple-50/30 rounded-lg w-fit">
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                                                            <span className="font-bold text-[10px] text-purple-600 uppercase tracking-widest">Analyzing</span>
                                                        </div>
                                                    )}

                                                    <div className="prose prose-slate prose-sm max-w-none">
                                                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                                    </div>

                                                    {msg.action === 'review_ready' && previewData && (
                                                        <div className="mt-6">
                                                            <button
                                                                onClick={() => setPreviewData(previewData)}
                                                                className="group relative inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-all shadow-lg shadow-purple-900/10 hover:shadow-purple-900/20 hover:-translate-y-0.5"
                                                            >
                                                                <span className="relative flex items-center gap-2">
                                                                    <LayoutTemplate className="w-4 h-4" /> Review Data
                                                                </span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={chatEndRef} className="w-full shrink-0" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* FLOATING INPUT AREA - DYNAMIC POSITIONING (GPT STYLE) */}
                        <div className={`fixed left-0 right-0 px-6 pointer-events-none z-20 transition-all duration-700 ease-in-out bottom-20 translate-y-0`}>
                            <div className="max-w-3xl mx-auto w-full pointer-events-auto">
                                <div className="relative group">
                                    {/* Glass Container */}
                                    <div className={`bg-white/80 backdrop-blur-2xl border border-white/60 shadow-2xl shadow-slate-300/40 rounded-[32px] p-2 flex items-center gap-2 transition-all duration-500 ease-in-out ${chatHistory.length <= 1
                                        ? 'h-[7rem]' // Hero Mode: Large Box
                                        : 'min-h-[60px]' // Standard Mode: Compact
                                        } ${inputValue.length > 50 ? 'rounded-[28px]' : ''}`}>

                                        {/* File Preview (Floating above) */}
                                        {stagedFile && (
                                            <div className="absolute bottom-full left-0 mb-4 ml-2 animate-in slide-in-from-bottom-2 zoom-in-95 fade-in duration-300">
                                                <div className="bg-white/80 backdrop-blur-xl p-3 pr-10 rounded-2xl shadow-xl shadow-purple-900/5 border border-white/80 flex items-center gap-3 relative ring-1 ring-black/5">
                                                    <div className="w-10 h-10 bg-gradient-to-br from-purple-50 to-blue-50 text-purple-600 rounded-xl flex items-center justify-center border border-white shadow-sm">
                                                        <FileText className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-900 max-w-[150px] truncate">{stagedFile.name}</p>
                                                        <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">Ready</p>
                                                    </div>
                                                    <button
                                                        onClick={() => setStagedFile(null)}
                                                        className="absolute right-2 top-2 p-1 hover:bg-slate-100 rounded-full transition-colors"
                                                    >
                                                        <XCircle className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Paperclip Button */}
                                        <label className="p-3 text-slate-400 hover:text-purple-600 hover:bg-purple-50/50 rounded-full cursor-pointer transition-all shrink-0 active:scale-95 mb-0.5">
                                            <input type="file" className="hidden" id="file-upload-hidden" onChange={handleFileSelect} />
                                            <Paperclip className="w-6 h-6" />
                                        </label>

                                        {/* Text Area */}
                                        <textarea
                                            value={inputValue}
                                            onChange={(e) => setInputValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage();
                                                }
                                            }}
                                            placeholder="Ask Xpoll to extract data..."
                                            className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none py-3.5 px-2 resize-none text-slate-700 placeholder:text-slate-400 text-base font-medium leading-relaxed overflow-hidden custom-scrollbar"
                                            rows={1}
                                        />

                                        {/* Send Button */}
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={!inputValue.trim() && !stagedFile}
                                            className={`p-3.5 rounded-full transition-all duration-300 shrink-0 mb-0.5 ${inputValue.trim() || stagedFile
                                                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 hover:bg-black hover:scale-105 active:scale-95'
                                                : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                                }`}
                                        >
                                            <Send className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. Bin TAB */}
                {activeTab === 'Bin' && (
                    <div className="flex flex-col h-full bg-slate-50/50 overflow-hidden">
                        <div className="h-full overflow-y-auto w-full p-8 max-w-7xl mx-auto">

                            {/* Header Section */}
                            <div className="flex items-end justify-between mb-10">
                                <div>
                                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Recent Bin</h2>
                                    <p className="text-slate-500 text-sm font-medium mt-1">
                                        Manage your recent data extraction cycles and job statuses.
                                    </p>
                                </div>
                                <button
                                    onClick={refetchJobs}
                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all active:scale-95"
                                >
                                    <RefreshCw className="w-4 h-4 text-slate-500" />
                                    Refresh
                                </button>
                            </div>

                            {/* Grid Section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {jobs?.map((job) => {
                                    const config = STATUS_CONFIG[job.status] || { color: 'bg-slate-100 text-slate-600', label: job.status, icon: null };

                                    return (
                                        <div
                                            key={job._id}
                                            className="group relative flex flex-col bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all duration-300"
                                        >
                                            {/* Card Header: Icon + Status */}
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wider ${config.color}`}>
                                                    {config.icon}
                                                    {config.label}
                                                </div>
                                            </div>

                                            {/* Card Body: Title + Date */}
                                            <div className="flex-1 min-w-0 mb-6">
                                                <h3
                                                    className="font-bold text-slate-900 truncate leading-snug group-hover:text-indigo-600 transition-colors"
                                                    title={job.originalName}
                                                >
                                                    {job.originalName}
                                                </h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Clock className="w-3 h-3 text-slate-400" />
                                                    <p className="text-[11px] text-slate-500 font-medium">
                                                        {new Date(job.createdAt).toLocaleDateString()} • {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Card Footer: Dynamic Actions */}
                                            <div className="pt-4 border-t border-slate-100">
                                                {job.status === 'waiting_approval' || job.status === 'completed' ? (
                                                    <button
                                                        onClick={() => handleReviewJob(job)}
                                                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 rounded-xl text-xs font-bold text-white hover:bg-indigo-600 shadow-lg shadow-slate-200 transition-all active:scale-[0.98]"
                                                    >
                                                        Review Data
                                                        <ArrowRight className="w-3.5 h-3.5" />
                                                    </button>
                                                ) : job.status === 'failed' ? (
                                                    <div className="flex flex-col gap-1 text-[11px] text-rose-600 bg-rose-50/50 p-3 rounded-xl border border-rose-100">
                                                        <div className="flex items-center gap-1 font-bold italic">
                                                            <AlertCircle className="w-3 h-3" />
                                                            Extraction Failed
                                                        </div>
                                                        <p className="opacity-80 line-clamp-1" title={job.error}>{job.error}</p>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-50 rounded-xl text-xs font-bold text-slate-400 border border-slate-100 italic">
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        Crunching data...
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Empty State */}
                                {(!jobs || jobs.length === 0) && (
                                    <div className="col-span-full py-24 flex flex-col items-center justify-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
                                        <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                                            <Upload className="w-10 h-10 text-indigo-300" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900">Your bin is empty</h3>
                                        <p className="text-slate-500 text-sm max-w-xs text-center mt-2 font-medium">
                                            Start by uploading a document in the AI Extraction tab to see your jobs here.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* PREVIEW MODAL (Shared) */}
            {previewData && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-6 md:p-10 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-7xl h-[65vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col ring-1 ring-black/5">
                        {/* Header */}
                        <div className="bg-white px-8 py-5 border-b border-slate-100 shrink-0 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                    <LayoutTemplate className="w-5 h-5 text-purple-600" />
                                    Review Extraction
                                </h2>
                                <p className="text-slate-500 text-xs font-medium mt-0.5">Please verify the data before committing to the registry.</p>
                            </div>

                            <div className="flex gap-2">
                                {previewData.tier === 0 && (
                                    <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100 flex items-center gap-1.5">
                                        <CheckCircle className="w-3.5 h-3.5" /> Template Matched
                                    </span>
                                )}
                                {previewData.tier > 0 && (
                                    <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-xs font-bold border border-purple-100 flex items-center gap-1.5">
                                        <CheckCircle className="w-3.5 h-3.5" /> New Pattern
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Validtion Warning */}
                        {previewData.preview['Unknown'] && (
                            <div className="bg-amber-50 px-8 py-3 border-b border-amber-100 flex items-center justify-between">
                                <span className="text-xs font-bold text-amber-800 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                    {previewData.preview['Unknown'].length} records require categorization (Missing State)
                                </span>
                            </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
                            {/* FALLBACK UI */}
                            {previewData.preview['Unknown'] && (
                                <div className="mb-8 bg-white p-6 rounded-2xl border border-amber-100 shadow-sm relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                                    <div className="flex flex-col md:flex-row gap-6 items-end">
                                        <div className="flex-1">
                                            <label className="text-xs font-bold uppercase text-slate-400 mb-2 block tracking-wider">Default State</label>
                                            <input
                                                value={fallbackState}
                                                onChange={(e) => setFallbackState(e.target.value)}
                                                placeholder="e.g. California"
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-xs font-bold uppercase text-slate-400 mb-2 block tracking-wider">Default City</label>
                                            <input
                                                value={fallbackCity}
                                                onChange={(e) => setFallbackCity(e.target.value)}
                                                placeholder="e.g. Los Angeles"
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none"
                                            />
                                        </div>
                                        <button
                                            onClick={handleApplyFallback}
                                            className="px-8 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all hover:scale-105"
                                        >
                                            Apply Fix
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* DATA PREVIEW */}
                            <div className="grid gap-8">
                                {previewData.summary.states.map((state) => (
                                    <div key={state.name} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
                                            <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                                {state.name === 'Unknown' ? <XCircle className="w-5 h-5 text-red-500" /> : <Database className="w-4 h-4 text-slate-400" />}
                                                {state.name}
                                            </h3>
                                            <span className="text-xs font-mono font-medium text-slate-400">{state.recordCount} records</span>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-white text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                                                    <tr>
                                                        {state.sampleRecords[0] && Object.keys(state.sampleRecords[0]).map(k => (
                                                            <th key={k} className="px-6 py-3 whitespace-nowrap">{k}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {state.sampleRecords.map((r, i) => (
                                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                            {Object.values(r).map((v, j) => (
                                                                <td key={j} className="px-6 py-3 text-slate-600 max-w-[200px] truncate">{v || '-'}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 bg-white border-t border-slate-100 flex justify-between items-center shrink-0">
                            {/* TEMPLATE SAVING UI (Only for new logic) */}
                            {previewData.tier > 0 ? (
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={saveTemplate}
                                            onChange={(e) => setSaveTemplate(e.target.checked)}
                                            className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                        />
                                        <span className="text-sm font-bold text-slate-700">Save as Template</span>
                                    </label>
                                    {saveTemplate && (
                                        <input
                                            type="text"
                                            value={templateName}
                                            onChange={(e) => setTemplateName(e.target.value)}
                                            placeholder="Template Name..."
                                            className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none w-56 transition-all animate-in fade-in slide-in-from-left-2"
                                            autoFocus
                                        />
                                    )}
                                </div>
                            ) : <div />}

                            <div className="flex gap-4">
                                <button
                                    onClick={() => setPreviewData(null)}
                                    className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCommit}
                                    disabled={committing || !!previewData.preview['Unknown'] || (saveTemplate && !templateName)}
                                    className="px-8 py-2.5 rounded-xl font-bold bg-black text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-black/20 flex items-center gap-2"
                                >
                                    {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                    Approve & Commit
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>

    );
};

export default ManageData;
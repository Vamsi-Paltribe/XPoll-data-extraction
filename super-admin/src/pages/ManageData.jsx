import { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, XCircle, Loader2, Database, RefreshCw, ChevronRight, Send, Paperclip, FileText, LayoutTemplate, MessageSquare, Table2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { parseImageToJSON } from '../utils/dataParser';

// 1. Import the worker correctly using Vite's ?url syntax
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// 2. Assign the worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const ManageData = () => {
    // UI State
    const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'registry'
    const [inputValue, setInputValue] = useState('');
    const [chatHistory, setChatHistory] = useState([
        { type: 'system', content: 'Hello! I am your Data Assistant. Drag & drop a file (PDF, CSV, Excel, Image) or type instructions to get started.' }
    ]);
    const [stagedFile, setStagedFile] = useState(null);
    const chatEndRef = useRef(null);

    // Processing State
    const [uploading, setUploading] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [committing, setCommitting] = useState(false);
    const [error, setError] = useState(null);
    const [saveTemplate, setSaveTemplate] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const queryClient = useQueryClient();

    // Fetch Master Data
    const { data: masterData, isLoading: isLoadingMaster, refetch: refetchMaster } = useQuery({
        queryKey: ['master-data'],
        queryFn: async () => {
            const res = await api.get('/admin/data/master');
            return res.data;
        }
    });

    const handleFileSelect = (e) => {
        if (e.target.files?.[0]) {
            setStagedFile(e.target.files[0]);
        }
    };

    const handleSendMessage = async () => {
        if (!inputValue.trim() && !stagedFile) return;

        // Add User Message
        const userMsg = {
            type: 'user',
            content: inputValue,
            file: stagedFile ? { name: stagedFile.name, size: stagedFile.size } : null
        };
        setChatHistory(prev => [...prev, userMsg]);

        const currentFile = stagedFile;
        const currentPrompt = inputValue; // TODO: Send this prompt to backend in future

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

    const processFile = async (file) => {
        setUploading(true);
        // Add "Processing" bubble
        setChatHistory(prev => [...prev, { type: 'system', isProcessing: true, content: `Processing ${file.name}...` }]);

        try {
            let parsedData = null;
            let fileType = file.name.split('.').pop().toLowerCase();

            // --- EXCEL / CSV ---
            if (['xlsx', 'xls', 'csv'].includes(fileType)) {
                try {
                    const data = await file.arrayBuffer();
                    const workbook = XLSX.read(data);
                    const sheetName = workbook.SheetNames[0];
                    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                    parsedData = { type: 'structured', content: json };
                } catch (csvError) {
                    throw new Error(`CSV/Excel parsing failed: ${csvError.message}`);
                }
            }
            // --- PDF ---
            else if (fileType === 'pdf') {
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;

                let fullTextConcatenated = "";
                let pagesData = [];
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    pagesData.push({ page: i, content: pageText });
                    fullTextConcatenated += pageText + "\n";
                }

                parsedData = {
                    type: 'pdf_text',
                    content: fullTextConcatenated,
                    metadata: { totalPages: pdf.numPages, structure: pagesData }
                };
            }
            // --- IMAGE ---
            else if (['png', 'jpg', 'jpeg', 'bmp', 'gif'].includes(fileType)) {
                const result = await parseImageToJSON(file, (progress) => {
                    // Optional: Update bubble with specific OCR progress if needed
                });

                if (result.success) {
                    parsedData = {
                        type: 'image_ocr',
                        content: result.text,
                        metadata: { confidence: result.confidence, words: result.words, lines: result.lines }
                    };
                } else {
                    throw new Error(`OCR failed: ${result.error}`);
                }
            }
            // --- TEXT ---
            else if (fileType === 'txt') {
                const text = await file.text();
                parsedData = { type: 'text', content: text };
            }

            if (parsedData) {
                // Send to Backend
                const res = await api.post('/admin/upload-document/preview', {
                    fileName: file.name,
                    fileData: parsedData
                });

                setPreviewData(res.data);

                // Update Chat with Success
                setChatHistory(prev => {
                    const filtered = prev.filter(m => !m.isProcessing); // Remove processing msg
                    return [...filtered, {
                        type: 'system',
                        content: `Successfully processed ${file.name}. Please review the extracted data.`,
                        action: 'review_ready'
                    }];
                });

                if (res.data.tier !== 0) {
                    setTemplateName(file.name.split('.')[0] + ' Parser');
                }
            } else {
                throw new Error("Unsupported file format");
            }

        } catch (err) {
            console.error("Processing Error:", err);
            setChatHistory(prev => {
                const filtered = prev.filter(m => !m.isProcessing);
                return [...filtered, { type: 'system', isError: true, content: `Error: ${err.message || 'Failed to process file'}` }];
            });
        } finally {
            setUploading(false);
        }
    };

    const handleCommit = async () => {
        if (!previewData) return;
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
            queryClient.invalidateQueries(['master-data']); // Refresh registry
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

        // Recalculate summary
        const newStates = Object.keys(newPreview);
        const newTotalRecords = Object.values(newPreview).reduce((sum, recs) => sum + recs.length, 0);

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
                        onClick={() => setActiveTab('registry')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all ${activeTab === 'registry' ? 'bg-black text-white shadow-lg shadow-black/20' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        <Table2 className="w-4 h-4" />
                        Global Registry
                    </button>
                </div>
            </div>
            {/* Header Tabs */}

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">

                {/* 1. CHAT TAB - AGENTIC (RESTORED & REFINED) */}
                {activeTab === 'chat' && (
                    <div className="flex flex-col relative bg-slate-50 overflow-hidden ">
                        {/* Ambient Background Effects */}
                        <div className="absolute top-10 right-0 w-[500px] h-[500px] bg-purple-200/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                        <div className="absolute bottom-10 left-0 w-[500px] h-[500px] bg-blue-200/20 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                        {/* Messages Area - Centered Column */}
                        <div className="flex-1 overflow-y-auto w-full scroll-smooth z-10 custom-scrollbar">
                            <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col ">

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
                        <div className={`fixed left-0 right-0 px-6 pointer-events-none z-20 transition-all duration-700 ease-in-out bottom-10 translate-y-0 `}>
                            <div className="max-w-3xl mx-auto w-full pointer-events-auto">
                                <div className="relative group">
                                    {/* Glass Container */}
                                    <div className={`bg-white/80 backdrop-blur-2xl border border-white/60 shadow-2xl shadow-slate-300/40 rounded-[32px] p-2 flex items-center gap-2 transition-all duration-500 ease-in-out ${chatHistory.length <= 1
                                        ? 'h-[7.5rem]' // Hero Mode: Large Box
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
                                            placeholder="Ask Cortex to extract data..."
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

                {/* 2. REGISTRY TAB */}
                {activeTab === 'registry' && (
                    <div className="h-full overflow-y-auto p-8 max-w-7xl mx-auto w-full">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Global Registry</h2>
                                <p className="text-slate-500 text-sm font-medium mt-1">Verified master data available to all users</p>
                            </div>
                            <button
                                onClick={() => refetchMaster()}
                                disabled={isLoadingMaster}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors bg-white border border-slate-200 shadow-sm"
                            >
                                <RefreshCw className={`w-5 h-5 text-slate-600 ${isLoadingMaster ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                            {isLoadingMaster ? (
                                <div className="p-24 flex flex-col items-center justify-center">
                                    <Loader2 className="w-10 h-10 text-slate-300 animate-spin mb-4" />
                                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Loading Registry...</p>
                                </div>
                            ) : masterData && masterData.data.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 border-b border-slate-100">
                                            <tr>
                                                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Source / Bucket</th>
                                                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Records</th>
                                                <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Imported At</th>
                                                <th className="px-6 py-4 text-right font-bold text-slate-500 uppercase tracking-wider text-xs">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {masterData.data.map((record) => (
                                                <tr key={record._id} className="hover:bg-slate-50/50 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center border border-purple-100">
                                                                <Database className="w-5 h-5" />
                                                            </div>
                                                            <div>
                                                                <span className="font-bold text-slate-900 block">
                                                                    {record.bucketId?.name || 'Unknown Bucket'}
                                                                </span>
                                                                <span className="text-xs text-slate-400 font-mono">ID: {record._id.slice(-6)}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                                                            {Array.isArray(record.data) ? record.data.length : 1} items
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-bold text-slate-500">
                                                            {new Date(record.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {/* VIEW DATA BUTTON (Opens Modal - Can reuse Preview Logic merely for display) */}
                                                        <button className="text-slate-400 hover:text-purple-600 font-bold text-xs flex items-center gap-1 justify-end w-full group-hover:translate-x-1 transition-all">
                                                            View Data <ChevronRight className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-24 text-center">
                                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <Database className="w-10 h-10 text-slate-300" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900">Registry Empty</h3>
                                    <p className="text-slate-500 mt-2 max-w-sm mx-auto">Upload documents in the "AI Extraction" tab to populate this global registry.</p>
                                </div>
                            )}
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
import React from 'react';
import { Upload, MessageSquare, FileText, Loader2, LayoutTemplate, Paperclip, XCircle, Send, Database } from 'lucide-react';
import { ChatMessage, PreviewData } from './types';

interface AIChatViewProps {
    chatHistory: ChatMessage[];
    inputValue: string;
    setInputValue: (value: string) => void;
    handleSendMessage: () => void;
    stagedFiles: File[];
    setStagedFiles: React.Dispatch<React.SetStateAction<File[]>>;
    handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    setPreviewData: (data: PreviewData | null) => void;
    previewData: PreviewData | null;
}

const AIChatView: React.FC<AIChatViewProps> = React.memo(({
    chatHistory,
    inputValue,
    setInputValue,
    handleSendMessage,
    stagedFiles,
    setStagedFiles,
    handleFileSelect,
    setPreviewData,
    previewData
}) => {
    const [isDragging, setIsDragging] = React.useState(false);

    const handleDragOver = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = React.useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const newFiles = Array.from(e.dataTransfer.files);
            setStagedFiles(prev => [...prev, ...newFiles]);
        }
    }, [setStagedFiles]);

    const removeFile = (index: number) => {
        setStagedFiles(prev => prev.filter((_, i) => i !== index));
    };
    return (
        <div
            className={`flex flex-col relative bg-slate-50 overflow-hidden h-full transition-colors duration-300 ${isDragging ? 'bg-purple-50/50' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Ambient Background Effects */}
            <div className="absolute top-10 right-0 w-[500px] h-[500px] bg-purple-200/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-10 left-0 w-[500px] h-[500px] bg-blue-200/20 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            {/* DRAG AND DROP OVERLAY */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-purple-600/10 backdrop-blur-md border-4 border-dashed border-purple-400 rounded-3xl m-4 flex flex-col items-center justify-center pointer-events-none animate-in fade-in zoom-in-95 duration-300">
                    <div className="w-20 h-20 bg-white rounded-3xl shadow-2xl flex items-center justify-center mb-4">
                        <Upload className="w-10 h-10 text-purple-600 animate-bounce" />
                    </div>
                    <p className="text-2xl font-bold text-purple-700">Drop files here to extract</p>
                    <p className="text-purple-500 font-medium mt-2">Release and we'll start analyzing</p>
                </div>
            )}

            {/* Messages Area - Centered Column */}
            <div className="flex-1 overflow-y-auto w-full scroll-smooth z-10 custom-scrollbar">
                <div className="max-w-3xl mx-auto px-6 flex flex-col pb-48">

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
                                    onClick={() => document.getElementById('file-upload-hidden')?.click()}
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
                        <div className='space-y-6 pt-4'>
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
                                        {msg.files && msg.files.length > 0 && (
                                            <div className="flex flex-col gap-2 mb-4">
                                                {msg.files.map((file, fIdx) => (
                                                    <div key={fIdx} className="flex items-center gap-3 p-3 bg-white/50 rounded-2xl border border-white/50 shadow-sm group hover:bg-white/80 transition-colors">
                                                        <div className="w-10 h-10 bg-gradient-to-br from-purple-50 to-white rounded-xl flex items-center justify-center shadow-sm text-purple-600 border border-purple-50">
                                                            <FileText className="w-5 h-5" />
                                                        </div>
                                                        <div className="flex-1 min-w-0 pr-2">
                                                            <p className="font-bold text-sm text-slate-900 truncate">{file.name}</p>
                                                            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{(file.size / 1024).toFixed(1)} KB</p>
                                                        </div>
                                                    </div>
                                                ))}
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

                            {/* File Previews (Scrollable Horizontal List) */}
                            {stagedFiles.length > 0 && (
                                <div className="absolute bottom-full left-0 mb-4 ml-2 flex gap-2 overflow-x-auto max-w-full pb-2 animate-in slide-in-from-bottom-2 zoom-in-95 fade-in duration-300">
                                    {stagedFiles.map((file, idx) => (
                                        <div key={idx} className="bg-white/80 backdrop-blur-xl p-3 pr-10 rounded-2xl shadow-xl shadow-purple-900/5 border border-white/80 flex items-center gap-3 relative ring-1 ring-black/5 shrink-0">
                                            <div className="w-10 h-10 bg-gradient-to-br from-purple-50 to-blue-50 text-purple-600 rounded-xl flex items-center justify-center border border-white shadow-sm">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-900 max-w-[120px] truncate">{file.name}</p>
                                                <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">Ready</p>
                                            </div>
                                            <button
                                                onClick={() => removeFile(idx)}
                                                className="absolute right-2 top-2 p-1 hover:bg-slate-100 rounded-full transition-colors"
                                            >
                                                <XCircle className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Paperclip Button */}
                            <label className="p-3 text-slate-400 hover:text-purple-600 hover:bg-purple-50/50 rounded-full cursor-pointer transition-all shrink-0 active:scale-95 mb-0.5">
                                <input type="file" multiple className="hidden" id="file-upload-hidden" onChange={handleFileSelect} />
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
                                autoFocus
                                placeholder="Ask Xpoll to extract data..."
                                className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none py-3.5 px-2 resize-none text-slate-700 placeholder:text-slate-400 text-base font-medium leading-relaxed overflow-hidden custom-scrollbar"
                                rows={1}
                            />

                            {/* Send Button */}
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim() && stagedFiles.length === 0}
                                className={`p-3.5 rounded-full transition-all duration-300 shrink-0 mb-0.5 ${inputValue.trim() || stagedFiles.length > 0
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
    );
});

export default AIChatView;

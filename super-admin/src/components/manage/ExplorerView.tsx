import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, ArrowUp, Database, LayoutTemplate, Bot, User, Sparkles } from 'lucide-react';

interface ExplorerViewProps {
    explorerQuery: string;
    setExplorerQuery: (query: string) => void;
    handleExplorerQuery: () => void;
    explorerData: { pipeline: any, results: any[] } | null;
    isExploring: boolean;
    error: string | null;
}

interface Message {
    id: string;
    role: 'user' | 'ai';
    content?: string;
    data?: { pipeline: any, results: any[] } | null;
    isError?: boolean;
}

const ExplorerView: React.FC<ExplorerViewProps> = React.memo(({
    explorerQuery,
    setExplorerQuery,
    handleExplorerQuery,
    explorerData,
    isExploring,
    error
}) => {
    // Local state for the chat history
    // Initialize with a welcome message
    const [messages, setMessages] = useState<Message[]>([
        { id: 'init', role: 'ai', content: 'Hello! I am your Data Agent. Ask me anything about your Global Registry data.' }
    ]);

    // Local input state to decouple from the actual execution state until send
    const [inputValue, setInputValue] = useState(explorerQuery);

    // To track when we are waiting for a response to push to history
    const [pendingResponse, setPendingResponse] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom on message update
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isExploring]);

    // Effect: Detect when data comes back and add to history
    useEffect(() => {
        if (explorerData && pendingResponse && !isExploring && !error) {
            setMessages(prev => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: 'ai',
                    data: explorerData,
                    content: `I found ${explorerData.results.length} records matching your request.`
                }
            ]);
            setPendingResponse(false);
        } else if (error && pendingResponse && !isExploring) {
            setMessages(prev => [
                ...prev,
                {
                    id: Date.now().toString(),
                    role: 'ai',
                    content: error,
                    isError: true
                }
            ]);
            setPendingResponse(false);
        }
    }, [explorerData, isExploring, error, pendingResponse]);

    const handleSend = () => {
        if (!inputValue.trim()) return;

        // 1. Add User Message
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: inputValue }]);

        // 2. Sync to parent state and trigger search
        setExplorerQuery(inputValue);
        setPendingResponse(true);

        setTimeout(() => {
            handleExplorerQuery();
        }, 100);

        setInputValue('');
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden font-sans">
            {/* Background Decoration */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-purple-200/30 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-200/30 rounded-full blur-[100px]" />
            </div>

            {/* Header */}
            <div className="flex-none p-4 border-b border-slate-200/60 bg-white/50 backdrop-blur-md z-10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-gradient-to-tr from-purple-600 to-blue-600 rounded-lg text-white">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-800 text-sm">Data Agent</h2>
                        <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Online
                        </span>
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth space-y-8">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start max-w-4xl'}`}>

                        {/* Avatar */}
                        {msg.role === 'ai' && (
                            <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm mt-1">
                                <Bot className="w-5 h-5 text-purple-600" />
                            </div>
                        )}

                        {/* Bubble */}
                        <div className={`flex flex-col gap-2 max-w-[90%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                            {/* Text Content */}
                            {msg.content && (
                                <div className={`px-5 py-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                    ? 'bg-slate-900 text-white rounded-br-none'
                                    : msg.isError
                                        ? 'bg-red-50 text-red-600 border border-red-100 rounded-bl-none'
                                        : 'bg-white text-slate-700 border border-slate-200/60 rounded-bl-none'
                                    }`}>
                                    {msg.content}
                                </div>
                            )}

                            {/* Data Content (AI Only) */}
                            {msg.data && (
                                <div className="w-full mt-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    {/* Mongo Query Preview */}
                                    <div className="mb-4 text-xs font-mono bg-slate-900 text-emerald-400 p-3 rounded-xl overflow-x-auto border border-slate-800 shadow-md max-w-full">
                                        <div className="flex items-center gap-2 mb-2 text-slate-500 border-b border-slate-800 pb-2">
                                            <Database className="w-3 h-3" />
                                            Generated Pipeline
                                        </div>
                                        {JSON.stringify(msg.data.pipeline, null, 2)}
                                    </div>

                                    {/* Data Table */}
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="overflow-x-auto max-h-[400px]">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-slate-50 sticky top-0 z-10">
                                                    <tr>
                                                        {msg.data.results[0] && Object.keys(msg.data.results[0]).map(k => (
                                                            <th key={k} className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase bg-slate-50 whitespace-nowrap">
                                                                {k.replace('data.', '')}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {msg.data.results.map((item: any, idx: number) => {
                                                        const displayRow = { ...item };
                                                        if (displayRow.data) {
                                                            Object.assign(displayRow, displayRow.data);
                                                            delete displayRow.data;
                                                        }
                                                        delete displayRow._id; delete displayRow.bucketId; delete displayRow.history; delete displayRow.__v;

                                                        return (
                                                            <tr key={idx} className="hover:bg-slate-50/80">
                                                                {Object.values(displayRow).map((val: any, vIdx) => (
                                                                    <td key={vIdx} className="px-4 py-2.5 text-slate-600 whitespace-nowrap max-w-[200px] truncate border-r border-transparent last:border-none">
                                                                        {typeof val === 'object' ? JSON.stringify(val) : val}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 font-medium">
                                            {msg.data.results.length} records found
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {/* Loading Indicator */}
                {isExploring && (
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm mt-1">
                            <Bot className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="px-5 py-3.5 rounded-2xl rounded-bl-none bg-white border border-slate-200/60 shadow-sm flex items-center gap-2">
                            <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                            <span className="text-sm text-slate-500 font-medium animate-pulse">Analyzing Data...</span>
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Input Area */}
            <div className="flex-none p-6 bg-white/80 backdrop-blur-lg border-t border-slate-200">
                <div className="max-w-4xl mx-auto relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-2xl opacity-20 group-hover:opacity-30 transition duration-300 blur"></div>
                    <div className="relative flex items-center bg-white rounded-xl shadow-sm border border-slate-200 p-2 pr-2">
                        <div className="p-3 text-slate-400">
                            <Search className="w-5 h-5" />
                        </div>
                        <textarea
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !isExploring && handleSend()}
                            disabled={isExploring}
                            autoFocus
                            placeholder="Ask Xpoll to extract data..."
                            className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none py-3.5 px-2 resize-none text-slate-700 placeholder:text-slate-400 text-base font-medium leading-relaxed overflow-hidden custom-scrollbar"
                            rows={1}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputValue.trim() || isExploring}
                            className="p-2.5 bg-slate-900 text-white rounded-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed group/btn"
                        >
                            {isExploring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4 group-hover/btn:-translate-y-0.5 transition-transform" />}
                        </button>
                    </div>
                    <div className="text-center mt-3">
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                            AI Powered Data Exploration
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default ExplorerView;

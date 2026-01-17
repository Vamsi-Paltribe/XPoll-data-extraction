import { Bot } from 'lucide-react';
import { cn } from '../../utils';

interface ConsoleHeaderProps {
    showHistory: boolean;
    setShowHistory: (show: boolean) => void;
    hasWaitingJobs: boolean;
}

export const ConsoleHeader = ({ showHistory, setShowHistory, hasWaitingJobs }: ConsoleHeaderProps) => {
    return (
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
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", !showHistory ? "bg-white shadow-sm text-[#2D384A]" : "text-slate-400 hover:text-slate-600")}
                >
                    Chat
                </button>
                <button
                    onClick={() => setShowHistory(true)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all relative", showHistory ? "bg-white shadow-sm text-[#2D384A]" : "text-slate-400 hover:text-slate-600")}
                >
                    Job History
                    {hasWaitingJobs && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-[#A8328D] rounded-full border border-white" />
                    )}
                </button>
            </div>
        </div>
    );
};

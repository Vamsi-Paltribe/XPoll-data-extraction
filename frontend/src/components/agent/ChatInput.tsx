import React from 'react';
import { Paperclip, ArrowUp, Loader2 } from 'lucide-react';
import { cn } from '@/utils';

interface ChatInputProps {
    input: string;
    setInput: (val: string) => void;
    onSend: (textOverride?: string, file?: File) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isProcessing: boolean;
}

export const ChatInput = ({
    input,
    setInput,
    onSend,
    fileInputRef,
    onFileSelect,
    isProcessing
}: ChatInputProps) => {
    return (
        <div className="p-4 border-t border-slate-50">
            <div className="max-w-4xl mx-auto relative">
                <textarea
                    className="w-full bg-[#F8F9FA] border-2 border-transparent rounded-[24px] pl-6 pr-24 py-5 text-sm font-medium text-[#2D384A] outline-none focus:border-[#2D384A]/10 focus:bg-white transition-all resize-none min-h-[64px] max-h-[160px] shadow-inner"
                    placeholder="Type a message or drag a file..."
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onSend();
                        }
                    }}
                />
                <div className="absolute right-3 bottom-3 flex items-center gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2.5 text-slate-400 hover:text-[#2D384A] hover:bg-slate-100 rounded-full transition-all"
                    >
                        <Paperclip size={20} />
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={onFileSelect}
                    />
                    <button
                        onClick={() => onSend()}
                        disabled={isProcessing || (!input.trim() && !isProcessing)}
                        className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                            input.trim() || isProcessing ? "bg-[#2D384A] text-white shadow-lg" : "bg-slate-100 text-slate-300"
                        )}
                    >
                        {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={3} />}
                    </button>
                </div>
            </div>
        </div>
    );
};

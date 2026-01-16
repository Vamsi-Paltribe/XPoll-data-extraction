import React from 'react';
import { MessageItem } from './MessageItem';
import { Message, Job } from '../../types';

interface ChatWindowProps {
    messages: Message[];
    allJobs: Job[] | undefined;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    onReviewJob: (job: Job) => void;
    onViewData: (data: any, pagination: any, prompt: string) => void;
    onSuggestionClick: (suggestion: string) => void;
    isProcessing: boolean;
}

export const ChatWindow = ({
    messages,
    allJobs,
    messagesEndRef,
    onReviewJob,
    onViewData,
    onSuggestionClick,
    isProcessing
}: ChatWindowProps) => {
    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg) => (
                <MessageItem
                    key={msg.id}
                    msg={msg}
                    allJobs={allJobs}
                    onReviewJob={onReviewJob}
                    onViewData={onViewData}
                />
            ))}

            {/* Suggestions */}
            {!isProcessing && messages[messages.length - 1]?.suggestions && (
                <div className="flex flex-wrap gap-2 animate-in slide-in-from-bottom-2 duration-300 delay-200 justify-start">
                    {messages[messages.length - 1].suggestions?.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => onSuggestionClick(s)}
                            className="px-4 py-2 bg-white border border-slate-200 rounded-full text-[11px] font-bold text-slate-500 hover:border-[#A8328D] hover:text-[#A8328D] transition-all hover:shadow-md"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            <div ref={messagesEndRef} />
        </div>
    );
};

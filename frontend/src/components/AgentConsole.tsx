import React, { lazy, Suspense } from 'react';
import { UploadCloud } from 'lucide-react';
import {
    ConsoleHeader,
    ChatWindow,
    ChatInput,
    JobHistory,
    useAgentConsole
} from './agent';

// Lazy Components
const ReviewExtractionModal = lazy(() => import('./ReviewExtractionModal'));
const QueryResultModal = lazy(() => import('./QueryResultModal'));

interface AgentConsoleProps {
    bucketId?: string;
    initialFile?: File | null;
}

const AgentConsole = ({ bucketId, initialFile }: AgentConsoleProps) => {
    const {
        messages, setMessages,
        input, setInput,
        isProcessing,
        isDragOver, setIsDragOver,
        showHistory, setShowHistory,
        messagesEndRef,
        fileInputRef,
        allJobs,
        handleSend,
        handleQueryExport,
        handleQueryPageChange,
        selectedReviewJob, setSelectedReviewJob,
        queryModalOpen, setQueryModalOpen,
        queryModalData, setQueryModalData,
        approveJob, rejectJob,
        loadMoreRef, hasNextPage, isFetchingNextPage
    } = useAgentConsole({ bucketId, initialFile });

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

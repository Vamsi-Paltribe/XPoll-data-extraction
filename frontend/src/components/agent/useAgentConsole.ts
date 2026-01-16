import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Job, Message } from '../../types';
import { useAgent, useJobs } from '../../hooks';

interface UseAgentConsoleProps {
    bucketId?: string;
    initialFile?: File | null;
}

export const useAgentConsole = ({ bucketId, initialFile }: UseAgentConsoleProps) => {
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

    // --- Hooks ---
    const { uploadFile, queryData } = useAgent(bucketId);
    const { jobs: allJobs, approveJob, rejectJob, fetchNextPage, hasNextPage, isFetchingNextPage } = useJobs(bucketId);

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
    }, [hasNextPage, fetchNextPage, showHistory]);

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
                const prompt = text.replace(`Ingest ${file.name}`, '').trim() || "Extract data";
                const res = await uploadFile.mutateAsync({ file, prompt });

                setMessages(prev => prev.filter(m => !m.isLoading).concat({
                    id: `sys_job_${Date.now()}`,
                    type: 'system',
                    jobId: res.jobId,
                    content: `Ingestion started for ${file.name}. Processing in background...`
                }));
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
                const res = await queryData.mutateAsync({ prompt: userPrompt });

                setMessages(prev => {
                    const filtered = prev.filter(m => !m.isLoading);
                    const { data, summary, pagination } = res;

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
            const res = await queryData.mutateAsync({
                prompt: queryModalData.prompt,
                page: 1,
                limit: 10000
            });

            const rows = res.data;
            if (!rows || rows.length === 0) return;

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
                const worksheet = XLSX.utils.json_to_sheet(exportData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Query Results");
                XLSX.writeFile(workbook, `${fileName}.xlsx`);
            }
        } catch (err) {
            console.error("Export Error", err);
        }
    };

    const handleQueryPageChange = async (newPage: number) => {
        if (!queryModalData.prompt) return;
        try {
            const res = await queryData.mutateAsync({
                prompt: queryModalData.prompt,
                page: newPage,
                limit: 20
            });
            setQueryModalData(prev => ({
                ...prev,
                records: res.data,
                pagination: res.pagination
            }));
        } catch (err) {
            console.error("Failed to load page");
        }
    };

    return {
        messages,
        setMessages,
        input,
        setInput,
        isProcessing,
        isDragOver,
        setIsDragOver,
        showHistory,
        setShowHistory,
        messagesEndRef,
        fileInputRef,
        allJobs,
        handleSend,
        handleQueryExport,
        handleQueryPageChange,
        selectedReviewJob,
        setSelectedReviewJob,
        queryModalOpen,
        setQueryModalOpen,
        queryModalData,
        setQueryModalData,
        approveJob,
        rejectJob,
        loadMoreRef,
        hasNextPage,
        isFetchingNextPage
    };
};

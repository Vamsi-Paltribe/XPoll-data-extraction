import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { MessageSquare, Upload, Search, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useSearchParams } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { ChatMessage, PreviewData } from '../components/manage/types';

// Lazy Load Components
const AIChatView = lazy(() => import('../components/manage/AIChatView'));
const JobBinView = lazy(() => import('../components/manage/JobBinView'));
const ExplorerView = lazy(() => import('../components/manage/ExplorerView'));
const PreviewModal = lazy(() => import('../components/manage/PreviewModal'));

// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Assign the worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;


const ManageData = () => {
    // UI State
    const [activeTab, setActiveTab] = useState<'chat' | 'Bin' | 'registry' | 'explorer'>('chat');
    const [inputValue, setInputValue] = useState('');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
        { type: 'system', content: 'Hello! I am your Data Assistant. Drag & drop a file (PDF, CSV, Excel, Image) or type instructions to get started.' }
    ]);
    const [stagedFile, setStagedFile] = useState<File | null>(null);

    // Processing State
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchParams] = useSearchParams();

    // Explorer State
    const [explorerQuery, setExplorerQuery] = useState('');
    const [explorerData, setExplorerData] = useState<{ pipeline: any, results: any[] } | null>(null);
    const [isExploring, setIsExploring] = useState(false);

    // Fallback State
    const [fallbackState, setFallbackState] = useState('');
    const [fallbackCity, setFallbackCity] = useState('');

    const handleExplorerQuery = useCallback(async () => {
        if (!explorerQuery.trim()) return;
        setIsExploring(true);
        setError(null);
        try {
            const res = await api.post('/explorer/query', { query: explorerQuery });
            if (res.data.success) {
                setExplorerData({
                    pipeline: res.data.pipeline,
                    results: res.data.results
                });
            }
        } catch (err: any) {
            console.error("Explorer Error", err);
            setError(err.response?.data?.error || "Failed to execute query");
        } finally {
            setIsExploring(false);
        }
    }, [explorerQuery, setIsExploring, setError, setExplorerData]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setStagedFile(e.target.files[0]);
        }
    }, []);

    // --- JOB DASHBOARD LOGIC ---
    const { data: jobs, refetch: refetchJobs } = useQuery({
        queryKey: ['jobs'],
        queryFn: async () => {
            const res = await api.get('/jobs');
            return res.data;
        },
        refetchInterval: 5000,
        enabled: activeTab === 'Bin',
    });

    // --- PAGINATION LOGIC ---
    const fetchJobPage = useCallback(async (jobId: string, page: number, jobContext?: any) => {
        try {
            const res = await api.get(`/records/${jobId}?page=${page}&limit=50`);
            const { records, pagination } = res.data;

            // Group by State
            const grouped: Record<string, any[]> = {};
            records.forEach((r: any) => {
                const state = r.State || 'Unknown';
                if (!grouped[state]) grouped[state] = [];
                grouped[state].push(r);
            });

            setPreviewData({
                tier: jobContext?.confidence > 0.8 ? 1 : 2,
                preview: grouped,
                summary: {
                    states: Object.entries(grouped).map(([name, recs]) => ({
                        name,
                        recordCount: recs.length,
                        sampleRecords: recs
                    }))
                },
                pagination: {
                    current: pagination.page,
                    total: pagination.total,
                    pages: pagination.totalPages
                },
                jobId: jobId
            });
        } catch (err) {
            console.error("Failed to fetch job page", err);
            setError("Failed to load records.");
        }
    }, [setPreviewData, setError]);

    const handleReviewJob = useCallback(async (job: any) => {
        await fetchJobPage(job._id, 1, job);
    }, [fetchJobPage]);

    // Open review if URL param exists
    const reviewJobId = searchParams.get('reviewJobId');
    useEffect(() => {
        if (reviewJobId) {
            const job = jobs?.find((j: any) => j._id === reviewJobId);
            if (job) {
                fetchJobPage(reviewJobId, 1, job);
            } else {
                fetchJobPage(reviewJobId, 1, { confidence: 0.9 });
            }
        }
    }, [reviewJobId, jobs, fetchJobPage]);


    const handlePageChange = useCallback(async (newPage: number) => {
        if (!previewData?.jobId) return;
        setPreviewData(prev => prev ? { ...prev, isLoading: true } as any : null);
        await fetchJobPage(previewData.jobId, newPage, { confidence: previewData.tier === 1 ? 0.9 : 0.5 });
    }, [previewData?.jobId, previewData?.tier, fetchJobPage, setPreviewData]);

    const processFile = async (file: File) => {
        const processingMsg: ChatMessage = { type: 'system', isProcessing: true, content: `Uploading & Processing ${file.name}...` };
        setChatHistory(prev => [...prev, processingMsg]);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await api.post('/upload/image', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                setChatHistory(prev => {
                    const filtered = prev.filter(m => !m.isProcessing);
                    const successMsg: ChatMessage = {
                        type: 'system',
                        content: `Successfully uploaded ${file.name}.\n\nURL: ${res.data.url} \n\nIt has been queued for processing.\nCheck backend logs for worker output.`,
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
                const errorMsg: ChatMessage = { type: 'system', isError: true, content: `Error: ${err.message || 'Failed to process file'} ` };
                return [...filtered, errorMsg];
            });
        }
    };

    const handleSendMessage = useCallback(async () => {
        if (!inputValue.trim() && !stagedFile) return;

        const userMsg: ChatMessage = {
            type: 'user',
            content: inputValue,
            file: stagedFile ? { name: stagedFile.name, size: stagedFile.size } : null
        };
        setChatHistory(prev => [...prev, userMsg]);

        const currentFile = stagedFile;
        setInputValue('');
        setStagedFile(null);

        if (currentFile) {
            await processFile(currentFile);
        } else {
            setTimeout(() => {
                setChatHistory(prev => [...prev, { type: 'system', content: "I see your message, but I currently only process files. Please attach a document!" }]);
            }, 500);
        }
    }, [inputValue, stagedFile, setChatHistory, setInputValue, setStagedFile, processFile]);

    const handleApplyFallback = useCallback(() => {
        if (!previewData || !previewData.preview['Unknown']) return;
        if (!fallbackState) return;

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
    }, [previewData, fallbackState, fallbackCity, setPreviewData, setFallbackState, setFallbackCity]);

    return (
        <div>
            {/* Tab Navigation */}
            <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all ${activeTab === 'chat' ? 'bg-black text-white shadow-lg shadow-black/20' : 'text-slate-500 hover:bg-slate-100'} `}
                    >
                        <MessageSquare className="w-4 h-4" />
                        AI Extraction
                    </button>
                    <button
                        onClick={() => setActiveTab('Bin')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all ${activeTab === 'Bin' ? 'bg-black text-white shadow-lg shadow-black/20' : 'text-slate-500 hover:bg-slate-100'} `}
                    >
                        <Upload className="w-4 h-4" />
                        Bin
                    </button>
                    <button
                        onClick={() => setActiveTab('explorer')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all ${activeTab === 'explorer' ? 'bg-black text-white shadow-lg shadow-black/20' : 'text-slate-500 hover:bg-slate-100'} `}
                    >
                        <Search className="w-4 h-4" />
                        Explorer
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative" style={{ height: 'calc(100vh - 145px)' }}> {/* Adjust height for header */}
                <Suspense fallback={
                    <div className="flex items-center justify-center h-full text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                }>
                    {activeTab === 'chat' && (
                        <AIChatView
                            chatHistory={chatHistory}
                            inputValue={inputValue}
                            setInputValue={setInputValue}
                            handleSendMessage={handleSendMessage}
                            stagedFile={stagedFile}
                            setStagedFile={setStagedFile}
                            handleFileSelect={handleFileSelect}
                            setPreviewData={setPreviewData}
                            previewData={previewData}
                        />
                    )}

                    {activeTab === 'Bin' && (
                        <JobBinView
                            jobs={jobs}
                            refetchJobs={refetchJobs}
                            handleReviewJob={handleReviewJob}
                        />
                    )}

                    {activeTab === 'explorer' && (
                        <ExplorerView
                            explorerQuery={explorerQuery}
                            setExplorerQuery={setExplorerQuery}
                            handleExplorerQuery={handleExplorerQuery}
                            explorerData={explorerData}
                            isExploring={isExploring}
                            error={error}
                        />
                    )}
                </Suspense>
            </div>

            {/* PREVIEW MODAL */}
            {previewData && (
                <Suspense fallback={<div className="fixed inset-0 z-50 bg-white/50" />}>
                    <PreviewModal
                        previewData={previewData}
                        setPreviewData={setPreviewData}
                        handlePageChange={handlePageChange}
                        handleApplyFallback={handleApplyFallback}
                        fallbackState={fallbackState}
                        setFallbackState={setFallbackState}
                        fallbackCity={fallbackCity}
                        setFallbackCity={setFallbackCity}
                        refetchJobs={refetchJobs}
                    />
                </Suspense>
            )}
        </div>
    );
};

export default ManageData;
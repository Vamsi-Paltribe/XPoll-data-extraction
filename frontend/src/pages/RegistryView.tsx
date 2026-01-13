import { useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    ChevronRight,
    Download,
    Database,
    Clock, UploadCloud
} from 'lucide-react';

import GlobalStyles from '../components/GlobalStyles';

// Lazy Components
const SyncModal = lazy(() => import('../components/SyncModal'));
const DataGrid = lazy(() => import('../components/DataGrid'));
const AgentConsole = lazy(() => import('../components/AgentConsole'));
const SchemaSettings = lazy(() => import('../components/SchemaSettings'));
const ReviewExtractionModal = lazy(() => import('../components/ReviewExtractionModal'));

const ComponentLoader = () => (
    <div className="flex items-center justify-center p-12 opacity-50">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-[#2D384A] rounded-full animate-spin" />
    </div>
);

// --- Interfaces ---
interface RegistryParameter {
    name: string;
    type: string;
    mapping: string;
}

interface Registry {
    name: string;
    parameters: RegistryParameter[];
}

interface RecordData {
    [key: string]: any;
}

interface Record {
    _id?: string;
    data: RecordData;
    status?: 'conflict' | 'valid' | string;
    [key: string]: any;
}

interface Job {
    _id: string;
    originalName: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'waiting_approval' | 'rejected' | 'paused';
    result?: any;
    createdAt: string;
    tokensConsumed?: number;
    error?: string;
}

interface PaginatedResponse {
    data: Record[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

const RegistryView = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // State
    const [dragActive, setDragActive] = useState(false);
    const [droppedFile, setDroppedFile] = useState<File | null>(null);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [selectedReviewJob, setSelectedReviewJob] = useState<Job | null>(null);

    // View State
    const [activeFilter, setActiveFilter] = useState<string>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'schema'>('grid');
    const [page, setPage] = useState(1);
    const LIMIT = 20;

    // --- Queries ---
    const { data: registry, isPending: loadingRegistry } = useQuery({
        queryKey: ['registry', id],
        queryFn: async () => {
            const res = await api.get(`/buckets/${id}`);
            return res.data as Registry;
        }
    });

    // Updated Query for Pagination
    const { data: customerData } = useQuery({
        queryKey: ['registry-customers', id, page],
        queryFn: async () => {
            try {
                const res = await api.get<PaginatedResponse>(`/buckets/${id}/customer?page=${page}&limit=${LIMIT}`);
                // Handle backward compatibility if API returns array (just in case deployment lag)
                if (Array.isArray(res.data)) {
                    return { data: res.data, total: res.data.length, page: 1, limit: 1000, totalPages: 1 };
                }
                return res.data;
            } catch (e) { return { data: [], total: 0, page: 1, limit: LIMIT, totalPages: 0 }; }
        },
        placeholderData: (previousData) => previousData // Keep previous data while fetching new page
    });

    const customerRecords = customerData?.data || [];
    const totalRecords = customerData?.total || 0;

    const { data: user } = useQuery({
        queryKey: ['user-me'],
        queryFn: async () => {
            const res = await api.get('/auth/me');
            return res.data;
        }
    });

    const { data: jobsData } = useInfiniteQuery({
        queryKey: ['jobs-infinite', id],
        queryFn: async ({ pageParam = 1 }) => {
            if (!id) return { jobs: [], pagination: { total: 0, page: 1, limit: 20, pages: 0 } };
            const res = await api.get<{ jobs: Job[], pagination: any } | Job[]>(`/jobs/bucket/${id}?page=${pageParam}&limit=20`);

            // Handle legacy array response
            if (Array.isArray(res.data)) {
                return {
                    jobs: res.data,
                    pagination: { total: res.data.length, page: 1, limit: 1000, pages: 1 }
                };
            }
            return res.data;
        },
        getNextPageParam: (lastPage) => {
            if (!lastPage || !lastPage.pagination) return undefined;
            const { page, pages } = lastPage.pagination;
            return page < pages ? page + 1 : undefined;
        },
        enabled: !!id,
        refetchInterval: 5000,
        initialPageParam: 1
    });

    const jobs = jobsData?.pages.flatMap(page => page.jobs) || [];

    const approvalJobs = jobs?.filter(j => j.status === 'waiting_approval') || [];

    // --- Mutations ---
    const syncMutation = useMutation({
        mutationFn: (filters: any) => api.post(`/buckets/${id}/sync`, { filters }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registry-customers', id] });
            queryClient.invalidateQueries({ queryKey: ['registry', id] });
            queryClient.invalidateQueries({ queryKey: ['jobs-infinite', id] });
            setShowSyncModal(false);
        }
    });

    const approveMutation = useMutation({
        mutationFn: async ({ jobId, options }: { jobId: string, options?: any }) =>
            api.post(`/jobs/${jobId}/approve`, options),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobs-infinite', id] });
            queryClient.invalidateQueries({ queryKey: ['registry-customers', id] });
            setSelectedReviewJob(null);
        },
        onError: (err: any) => {
            window.alert('Failed to approve job: ' + (err.response?.data?.error || err.message));
        }
    });

    const rejectMutation = useMutation({
        mutationFn: async (jobId: string) => api.post(`/jobs/${jobId}/reject`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobs-infinite', id] });
            setSelectedReviewJob(null);
        }
    });


    // Drag & Drop Handlers (Full Screen)
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
                setDragActive(false);
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileDrop(e.dataTransfer.files[0]);
        }
    };

    const handleFileDrop = (file: File) => {
        if (!registry?.parameters || registry.parameters.length === 0) {
            window.alert('⚠️ Please define parameters in Settings first.');
            return;
        }
        setDroppedFile(file);
    };

    const getDisplayColumns = () => {
        const params = registry?.parameters || [];
        const paramResult = params.map(p => p.mapping || p.name);
        return paramResult.length > 0 ? paramResult : (customerRecords[0]?.data ? Object.keys(customerRecords[0].data).filter((k: string) => k !== '__v') : []);
    };

    if (loadingRegistry) return (
        <div className="flex flex-col h-screen items-center justify-center bg-[#f0f4f9]">
            <GlobalStyles />
            <div className="w-12 h-12 bg-[#2D384A] rounded-2xl flex items-center justify-center animate-pulse shadow-lg">
                <Database className="w-6 h-6 text-white" />
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 animate-pulse">Loading Workspace</p>
        </div>
    );

    const onNextPage = () => {
        if (page < (customerData?.totalPages || 1)) setPage(p => p + 1);
    };

    const onPrevPage = () => {
        if (page > 1) setPage(p => p - 1);
    };

    return (
        <div
            className="animate-in fade-in h-[90dvh] flex flex-col gap-4"
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
        >
            <GlobalStyles />

            {/* Global Drag Overlay */}
            {dragActive && (
                <div
                    onDragLeave={() => setDragActive(false)}
                    className="fixed inset-0 z-[200] bg-[#2D384A]/90 backdrop-blur-sm flex items-center justify-center animate-in fade-in"
                >
                    <div className="text-center pointer-events-none">
                        <div className="w-24 h-24 bg-white/10 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-bounce">
                            <UploadCloud className="text-white w-10 h-10" />
                        </div>
                        <h2 className="text-3xl font-extrabold text-white mb-2">Drop to Analyze</h2>
                        <p className="text-slate-400 font-medium">Agent will process this file against the schema.</p>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="px-8 py-5 flex items-center justify-between sticky top-0 z-20 backdrop-blur-sm rounded-2xl bg-white">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/')}
                        className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center text-slate-500 transition-all shadow-sm"
                    >
                        <ArrowLeft size={18} strokeWidth={2.5} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                            <span>Buckets</span>
                            <ChevronRight size={10} />
                            <span className="text-[#A8328D]">Workspace</span>
                        </div>
                        <h1 className="text-xl font-extrabold text-[#2D384A] tracking-tight">{registry?.name || 'Loading...'}</h1>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-100">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Records</span>
                        <span className="text-sm font-bold text-[#2D384A]">{totalRecords.toLocaleString()}</span>
                    </div>
                    <button
                        onClick={() => setShowSyncModal(true)}
                        className="bg-white text-[#2D384A] px-5 py-2.5 rounded-[16px] text-xs font-bold uppercase tracking-wider hover:shadow-lg transition-all flex items-center gap-2 border border-slate-200"
                    >
                        <Clock size={16} className="text-[#F7A25A]" /> Download Data
                    </button>
                    <button className="bg-[#2D384A] text-white px-5 py-2.5 rounded-[16px] text-xs font-bold uppercase tracking-wider hover:shadow-lg hover:shadow-[#2D384A]/20 transition-all flex items-center gap-2">
                        <Download size={16} /> Export
                    </button>
                </div>
            </header>

            {/* Split Screen Content */}
            <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
                {/* LEFT: Data Truth (55% -> 7 cols) */}
                <div className="col-span-12 lg:col-span-7 h-full flex flex-col overflow-hidden">
                    <Suspense fallback={<ComponentLoader />}>
                        {viewMode === 'grid' ? (
                            <DataGrid
                                records={customerRecords}
                                columns={getDisplayColumns()}
                                totalCount={totalRecords}

                                // Pagination
                                onNextPage={customerData?.page && customerData.page < customerData.totalPages ? onNextPage : undefined}
                                onPrevPage={page > 1 ? onPrevPage : undefined}
                                pageInfo={`Page ${page} of ${customerData?.totalPages || 1}`}

                                // Filters
                                activeFilter={activeFilter}
                                onFilterChange={setActiveFilter}

                                // Features
                                onSettingsClick={() => setViewMode('schema')}

                                // Approvals
                                approvalJobs={approvalJobs}
                                onReviewJob={(job) => setSelectedReviewJob(job as Job)}
                            />
                        ) : registry ? (
                            <SchemaSettings
                                registry={registry}
                                bucketId={id || ''}
                                onBack={() => setViewMode('grid')}
                            />
                        ) : (
                            <div>Loading Settings...</div>
                        )}
                    </Suspense>
                </div>

                {/* RIGHT: Agent Brain (45% -> 5 cols) */}
                <div className="col-span-12 lg:col-span-5 h-full flex flex-col overflow-hidden">
                    <Suspense fallback={<ComponentLoader />}>
                        <AgentConsole
                            bucketId={id}
                            userTokens={user?.tokens}
                            initialFile={droppedFile}
                        />
                    </Suspense>
                </div>
            </div>

            <Suspense fallback={null}>
                {showSyncModal && (
                    <SyncModal
                        isOpen={showSyncModal}
                        onClose={() => setShowSyncModal(false)}
                        onSync={(filters: any) => syncMutation.mutate(filters)}
                        isSyncing={syncMutation.isPending}
                    />
                )}

                {/* Centralized Review Modal */}
                {selectedReviewJob && (
                    <div className="absolute inset-0 z-50">
                        <ReviewExtractionModal
                            job={selectedReviewJob}
                            onClose={() => setSelectedReviewJob(null)}
                            onApprove={(jobId: string, options?: any) => {
                                approveMutation.mutate({ jobId, options });
                            }}
                            onReject={(id: string) => rejectMutation.mutate(id)}
                            isProcessing={approveMutation.isPending || rejectMutation.isPending}
                        />
                    </div>
                )}
            </Suspense>
        </div>
    );
};

export default RegistryView;

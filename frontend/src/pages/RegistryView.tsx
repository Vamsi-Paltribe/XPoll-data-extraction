import { useState, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import {
    Database
} from 'lucide-react';

import GlobalStyles from '../components/GlobalStyles';
import { Job } from '../types';
import { useBucket, useRegistryRecords, useJobs, useSyncRegistry } from '../hooks';

import {
    WorkspaceHeader,
    WorkspaceDragOverlay
} from '../components/workspace';

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

const RegistryView = () => {
    const { id } = useParams();

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

    // --- Hooks ---
    const { data: registry, isPending: loadingRegistry } = useBucket(id);
    const { data: customerData } = useRegistryRecords(id, page, LIMIT);
    const { jobs, approveJob, rejectJob } = useJobs(id);
    const syncMutation = useSyncRegistry(id);

    const customerRecords = customerData?.data || [];
    const totalRecords = customerData?.total || 0;
    const approvalJobs = jobs?.filter(j => j.status === 'waiting_approval') || [];

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
        const totalPages = customerData?.totalPages || 1;
        if (page < totalPages) setPage(p => p + 1);
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
                <WorkspaceDragOverlay onDragLeave={() => setDragActive(false)} />
            )}

            {/* Header */}
            <WorkspaceHeader
                name={registry?.name || 'Loading...'}
                totalRecords={totalRecords}
                onSyncClick={() => setShowSyncModal(true)}
            />

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
                                onNextPage={(customerData?.page || page) < (customerData?.totalPages || 1) ? onNextPage : undefined}
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
                                approveJob.mutate({ jobId, options }, {
                                    onSuccess: () => setSelectedReviewJob(null)
                                });
                            }}
                            onReject={(id: string) => rejectJob.mutate(id, {
                                onSuccess: () => setSelectedReviewJob(null)
                            })}
                            isProcessing={approveJob.isPending || rejectJob.isPending}
                        />
                    </div>
                )}
            </Suspense>
        </div>
    );
};

export default RegistryView;

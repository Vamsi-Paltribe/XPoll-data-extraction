import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import {
    Database
} from 'lucide-react';

import GlobalStyles from '../components/GlobalStyles';
import { Job } from '../types';
import { useRegistryView } from '../components/registry';

const RegistryHeader = lazy(() => import('../components/registry').then(module => ({ default: module.RegistryHeader })));
const RegistryDragOverlay = lazy(() => import('../components/registry').then(module => ({ default: module.RegistryDragOverlay })));

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
    const {
        dragActive, setDragActive,
        droppedFile,
        showSyncModal, setShowSyncModal,
        selectedReviewJob, setSelectedReviewJob,
        activeFilter, setActiveFilter,
        viewMode, setViewMode,
        page,
        registry, loadingRegistry,
        customerData,
        customerRecords,
        totalRecords,
        approvalJobs,
        syncMutation,
        approveJob, rejectJob,
        handleDrag,
        handleDrop,
        getDisplayColumns,
        onNextPage,
        onPrevPage
    } = useRegistryView(id);

    if (loadingRegistry) return (
        <div className="flex flex-col h-screen items-center justify-center bg-[#f0f4f9]">
            <GlobalStyles />
            <div className="w-12 h-12 bg-[#2D384A] rounded-2xl flex items-center justify-center animate-pulse shadow-lg">
                <Database className="w-6 h-6 text-white" />
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 animate-pulse">Loading Workspace</p>
        </div>
    );

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
                <RegistryDragOverlay onDragLeave={() => setDragActive(false)} />
            )}

            {/* Header */}
            <RegistryHeader
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

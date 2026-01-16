import { useState } from 'react';
import { Job } from '../../types';
import { useBucket, useRegistryRecords, useJobs, useSyncRegistry } from '../../hooks';

export const useRegistryView = (id: string | undefined) => {
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
    const handleDrag = (e: DragEvent) => {
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

    const handleDrop = (e: DragEvent) => {
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

    const onNextPage = () => {
        const totalPages = customerData?.totalPages || 1;
        if (page < totalPages) setPage(p => p + 1);
    };

    const onPrevPage = () => {
        if (page > 1) setPage(p => p - 1);
    };

    return {
        id,
        dragActive, setDragActive,
        droppedFile, setDroppedFile,
        showSyncModal, setShowSyncModal,
        selectedReviewJob, setSelectedReviewJob,
        activeFilter, setActiveFilter,
        viewMode, setViewMode,
        page, setPage,
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
    };
};

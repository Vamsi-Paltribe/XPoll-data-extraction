import { useState, useEffect } from 'react';
import { useJobRecords } from './useJobs';

interface UseReviewExtractionProps {
    jobId: string;
    onClose: () => void;
}

export const useReviewExtraction = ({ jobId, onClose }: UseReviewExtractionProps) => {
    const [page, setPage] = useState(1);
    const [manualState, setManualState] = useState('');
    const limit = 15;

    const { data, isLoading } = useJobRecords(jobId, page, limit);

    const records = data?.records || [];
    const pagination = data?.pagination || { total: 0, pages: 1 };

    // Close on ESC
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return {
        page,
        setPage,
        manualState,
        setManualState,
        records,
        pagination,
        isLoading
    };
};

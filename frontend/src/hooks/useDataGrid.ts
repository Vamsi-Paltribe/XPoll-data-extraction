import { useState, useMemo } from 'react';
import { Record } from '../types';

interface UseDataGridProps {
    records: Record[];
    onPageChange?: (newPage: number) => void;
    onNextPage?: () => void;
    onPrevPage?: () => void;
    pagination?: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}

export const useDataGrid = ({
    records,
    onPageChange,
    onNextPage,
    onPrevPage,
    pagination
}: UseDataGridProps) => {
    const [showFilters, setShowFilters] = useState(false);
    const [columnFilters, setColumnFilters] = useState<{ [key: string]: string }>({});

    const handleColumnFilterChange = (col: string, val: string) => {
        setColumnFilters(prev => ({ ...prev, [col]: val }));
    };

    const filteredRecords = useMemo(() => {
        if (!showFilters || Object.keys(columnFilters).length === 0) return records;
        return records.filter(rec => {
            return Object.entries(columnFilters).every(([col, val]) => {
                if (!val) return true;
                const cellValue = rec.data?.[col];
                return String(cellValue ?? '').toLowerCase().includes(val.toLowerCase());
            });
        });
    }, [records, columnFilters, showFilters]);

    const handleNext = () => {
        if (onPageChange && pagination) {
            onPageChange(pagination.page + 1);
        } else if (onNextPage) {
            onNextPage();
        }
    };

    const handlePrev = () => {
        if (onPageChange && pagination) {
            onPageChange(pagination.page - 1);
        } else if (onPrevPage) {
            onPrevPage();
        }
    };

    const canNext = pagination ? pagination.page < pagination.pages : !!onNextPage;
    const canPrev = pagination ? pagination.page > 1 : !!onPrevPage;

    return {
        showFilters,
        setShowFilters,
        columnFilters,
        handleColumnFilterChange,
        filteredRecords,
        handleNext,
        handlePrev,
        canNext,
        canPrev
    };
};

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import endpoints from '../constants/endpoints';
import { Record, PaginatedResponse } from '../types';

export const useRegistryRecords = (id: string | undefined, page: number, limit: number = 20) => {
    const fetchRecords = async () => {
        if (!id) return { data: [], total: 0, page: 1, limit, totalPages: 0 };
        try {
            const res = await api.get<PaginatedResponse<Record>>(
                `${endpoints.buckets.customer(id)}?page=${page}&limit=${limit}`
            );
            if (Array.isArray(res.data)) {
                return { data: res.data, total: res.data.length, page: 1, limit: 1000, totalPages: 1 };
            }
            return res.data;
        } catch (e) {
            return { data: [], total: 0, page: 1, limit, totalPages: 0 };
        }
    };

    return useQuery({
        queryKey: ['registry-customers', id, page],
        queryFn: fetchRecords,
        placeholderData: (previousData) => previousData,
        enabled: !!id,
    });
};

export const useSyncRegistry = (id: string | undefined) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (filters: any) => api.post(endpoints.buckets.sync(id), { filters }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registry-customers', id] });
            queryClient.invalidateQueries({ queryKey: ['registry', id] });
            queryClient.invalidateQueries({ queryKey: ['jobs-infinite', id] });
        }
    });
};

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import endpoints from '@/constants/endpoints';

export const useMergeAnalysis = (sourceId: string, targetId: string, enabled: boolean) => {
    return useQuery({
        queryKey: ['merge-analysis', sourceId, targetId],
        queryFn: async () => {
            const res = await api.post(endpoints.merge.analyze, { sourceId, targetId });
            return res.data;
        },
        enabled
    });
};

export const useExecuteMerge = (onSuccess: (newBucketId: string) => void) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: any) => api.post(endpoints.merge.execute, data),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['registries'] });
            onSuccess(res.data.bucketId);
        }
    });
};

import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import endpoints from '@/constants/endpoints';

export const useAgent = (bucketId: string | undefined) => {
    const queryClient = useQueryClient();

    const uploadFile = useMutation({
        mutationFn: async ({ file, prompt }: { file: File, prompt: string }) => {
            const formData = new FormData();
            formData.append('file', file);
            if (bucketId) formData.append('bucketId', bucketId);
            formData.append('prompt', prompt);

            const res = await api.post(endpoints.agent.upload, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['user-me'] });
            queryClient.invalidateQueries({ queryKey: ['jobs-infinite', bucketId] });
        }
    });

    const queryData = useMutation({
        mutationFn: async ({ prompt, page = 1, limit = 20 }: { prompt: string, page?: number, limit?: number }) => {
            const res = await api.post(endpoints.agent.query, {
                bucketId,
                prompt,
                page,
                limit
            });
            return res.data;
        }
    });

    return { uploadFile, queryData };
};

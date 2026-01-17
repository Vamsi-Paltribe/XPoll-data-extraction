import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import endpoints from '@/constants/endpoints';
import { Bucket, Registry, RegistryParameter } from '@/types';

export const useBuckets = () => {
    const queryClient = useQueryClient();

    const fetchBuckets = async () => {
        const res = await api.get<Bucket[]>(endpoints.buckets.base);
        return res.data;
    };

    const { data: buckets = [], ...rest } = useQuery({
        queryKey: ['registries'],
        queryFn: fetchBuckets,
    });

    const createBucket = useMutation({
        mutationFn: (data: { name: string; description: string; parameters: any[] }) =>
            api.post(endpoints.buckets.base, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registries'] });
        },
    });

    const unmergeBucket = useMutation({
        mutationFn: ({ id, action }: { id: string, action: string }) =>
            api.post(endpoints.merge.unmerge(id), { newDataAction: action }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registries'] });
        },
    });

    return { buckets, createBucket, unmergeBucket, ...rest };
};

export const useBucket = (id: string | undefined) => {
    const fetchBucket = async () => {
        if (!id) throw new Error('Bucket ID is required');
        const res = await api.get<Registry>(endpoints.buckets.one(id));
        return res.data;
    };

    return useQuery({
        queryKey: ['registry', id],
        queryFn: fetchBucket,
        enabled: !!id,
    });
};

export const useDirectory = (enabled: boolean = true) => {
    return useQuery({
        queryKey: ['global-directory'],
        queryFn: async () => {
            const res = await api.get(endpoints.buckets.directory);
            return res.data;
        },
        enabled,
        staleTime: 5 * 60 * 1000 // Cache for 5 mins
    });
};

export const useBucketHeaders = (bucketId: string | undefined) => {
    return useMutation({
        mutationFn: async () => {
            const res = await api.post(endpoints.buckets.headers(bucketId), {
                filters: { states: [], cities: [] }
            });
            return res.data as string[];
        }
    });
};

export const useUpdateBucketSettings = (bucketId: string | undefined) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (parameters: RegistryParameter[]) => api.put(endpoints.buckets.settings(bucketId), { parameters }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registry', bucketId] });
        }
    });
};

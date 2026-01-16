import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import endpoints from '../constants/endpoints';
import { Job } from '../types';

export const useJobs = (bucketId: string | undefined) => {
    const queryClient = useQueryClient();

    const fetchJobs = async ({ pageParam = 1 }) => {
        if (!bucketId) return { jobs: [], pagination: { total: 0, page: 1, limit: 20, pages: 0 } };
        const res = await api.get<{ jobs: Job[], pagination: any } | Job[]>(
            `${endpoints.jobs.byBucket(bucketId)}?page=${pageParam}&limit=20`
        );

        if (Array.isArray(res.data)) {
            return {
                jobs: res.data,
                pagination: { total: res.data.length, page: 1, limit: 1000, pages: 1 }
            };
        }
        return res.data;
    };

    const jobsQuery = useInfiniteQuery({
        queryKey: ['jobs-infinite', bucketId],
        queryFn: fetchJobs,
        getNextPageParam: (lastPage: any) => {
            if (!lastPage || !lastPage.pagination) return undefined;
            const { page, pages } = lastPage.pagination;
            return page < pages ? page + 1 : undefined;
        },
        enabled: !!bucketId,
        refetchInterval: 5000,
        initialPageParam: 1
    });

    const approveJob = useMutation({
        mutationFn: async ({ jobId, options }: { jobId: string, options?: any }) =>
            api.post(endpoints.jobs.approve(jobId), options),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobs-infinite', bucketId] });
            queryClient.invalidateQueries({ queryKey: ['registry-customers', bucketId] });
        },
    });

    const rejectJob = useMutation({
        mutationFn: async (jobId: string) => api.post(endpoints.jobs.reject(jobId)),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobs-infinite', bucketId] });
        },
    });

    return {
        jobs: jobsQuery.data?.pages.flatMap(page => page.jobs) || [],
        approveJob,
        rejectJob,
        ...jobsQuery
    };
};

export const useJobRecords = (jobId: string, page: number, limit: number) => {
    return useQuery({
        queryKey: ['job-records', jobId, page],
        queryFn: async () => {
            const res = await api.get(`${endpoints.jobs.records(jobId)}?page=${page}&limit=${limit}`);
            return res.data;
        }
    });
};

export const useActiveJobs = () => {
    return useQuery({
        queryKey: ['active-jobs'],
        queryFn: async () => {
            const res = await api.get(endpoints.jobs.active);
            return res.data;
        },
        refetchInterval: 5 * 60 * 1000 // Poll every 5min for real-time vibe
    });
};

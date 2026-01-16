const endpoints = {
    buckets: {
        base: '/buckets',
        one: (id: string) => `/buckets/${id}`,
        customer: (id: string | undefined) => `/buckets/${id}/customer`,
        sync: (id: string | undefined) => `/buckets/${id}/sync`,
        directory: '/buckets/global/directory',
        headers: (id: string | undefined) => `/buckets/${id}/headers`,
        settings: (id: string | undefined) => `/buckets/${id}/settings`,
    },
    auth: {
        me: '/auth/me',
    },
    jobs: {
        byBucket: (id: string | undefined) => `/jobs/bucket/${id}`,
        approve: (id: string) => `/jobs/${id}/approve`,
        reject: (id: string) => `/jobs/${id}/reject`,
        records: (id: string) => `/jobs/${id}/records`,
        active: '/jobs/active',
    },
    agent: {
        upload: '/agent/upload',
        query: '/agent/query',
    },
    merge: {
        unmerge: (id: string) => `/merge/unmerge/${id}`,
        analyze: '/merge/analyze',
        execute: '/merge/execute',
    },
};

export default endpoints;

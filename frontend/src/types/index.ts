export interface RegistryParameter {
    name: string;
    type: string;
    mapping?: string;
}

export interface Registry {
    _id: string;
    name: string;
    description?: string;
    parameters: RegistryParameter[];
    recordCount?: number;
    lastSyncedAt?: string;
    status?: 'active' | 'paused';
    isMerged?: boolean;
    hiddenByMerge?: boolean;
    parentLineage?: {
        parents: string[];
        mergedAt: string;
    };
}

export type Bucket = Registry;

export interface RecordData {
    [key: string]: any;
}

export interface Record {
    _id?: string;
    data: RecordData;
    status?: 'conflict' | 'valid' | string;
    [key: string]: any;
}

export interface Job {
    _id: string;
    originalName: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'waiting_approval' | 'rejected' | 'paused';
    result?: any;
    createdAt: string;
    tokensConsumed?: number;
    error?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    pages?: number; // Some APIs use pages instead of totalPages
}

export interface User {
    id: string;
    email: string;
    tokens: number;
    [key: string]: any;
}

export interface Message {
    id: string;
    type: 'user' | 'system';
    content: React.ReactNode;
    file?: File;
    isLoading?: boolean;
    isError?: boolean;
    jobId?: string;
    suggestions?: string[];
    queryResult?: {
        summary: { type: 'stat', value: any, label: string } | null;
        data: any[];
        pagination: any;
        prompt: string;
    };
}

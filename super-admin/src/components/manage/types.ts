export interface ChatMessage {
    type: 'system' | 'user';
    content: string;
    file?: { name: string; size: number } | null;
    isProcessing?: boolean;
    isError?: boolean;
    isSuccess?: boolean;
    action?: string;
}

export interface RegistryRecord {
    _id: string;
    bucketId: { name: string };
    data: any[] | any;
    createdAt: string;
}

export interface PreviewData {
    tier: number;
    preview: Record<string, any[]>;
    summary: {
        states: {
            name: string;
            recordCount: number;
            sampleRecords: any[];
        }[];
    };
    pagination?: {
        current: number;
        total: number;
        pages: number;
    };
    jobId?: string;
    logic?: any;
    signature?: string;
}

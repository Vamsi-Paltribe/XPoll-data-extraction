import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import clsx from 'clsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import SyncModal from '../components/SyncModal';
import {
    Database, Layers, Settings,
    Database as DataIcon,
    Info, CheckCircle2,
    Clock,
    Bot,
    ArrowLeft,
    Zap,
    Plus,
    Trash2,
    Calendar,
    Hash,
    Type,
    Check,
    Loader2,
    LucideIcon
} from 'lucide-react';
import AIAgentView from '../components/AIAgentView';
import { AxiosError } from 'axios';

const STANDARD_FIELDS = ['Name', 'Age', 'Contact', 'Address', 'City', 'State', 'Occupation', 'Gender'];

interface TabButtonProps {
    active: boolean;
    onClick: () => void;
    label: string;
    count?: number;
    icon?: LucideIcon;
}

const TabButton = ({ active, onClick, label, count, icon: Icon }: TabButtonProps) => (
    <button
        onClick={onClick}
        className={clsx(
            "px-6 py-3 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 relative",
            active ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
        )}
    >
        {Icon && <Icon className={clsx("w-4 h-4", active ? "text-slate-900" : "text-slate-400")} />}
        {label}
        {count !== undefined && count > 0 && (
            <span className={clsx(
                "px-1.5 py-0.5 rounded text-[10px] font-bold",
                active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"
            )}>
                {count}
            </span>
        )}
        {active && <div className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-slate-900 animate-in fade-in slide-in-from-bottom-1" />}
    </button>
);

interface RegistryParameter {
    name: string;
    type: string;
    mapping: string;
}

interface Registry {
    name: string;
    parameters: RegistryParameter[];
}

interface RecordData {
    [key: string]: any;
}

interface Record {
    _id?: string;
    data: RecordData;
    status?: 'conflict' | 'valid' | string;
    [key: string]: any;
}

interface SyncLog {
    _id: string;
    createdAt: string;
    recordCount: number;
    conflictCount: number;
    filters?: {
        states?: string[];
    };
    status: 'pending' | 'committed' | string;
}

const RegistryView = () => {
    const { id } = useParams();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('agent');
    const [showSyncModal, setShowSyncModal] = useState(false);
    // const [showImportModal, setShowImportModal] = useState(false); // Removed per user request
    const [newParameter, setNewParameter] = useState({ name: '', type: 'text', mapping: '' });
    const [dragActive, setDragActive] = useState(false);
    const [droppedFile, setDroppedFile] = useState<File | null>(null);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileDrop(e.dataTransfer.files[0]);
            setActiveTab('agent');
        }
    };

    // Queries
    const { data: registry, isPending: loadingRegistry } = useQuery({
        queryKey: ['registry', id],
        queryFn: async () => {
            const res = await api.get(`/buckets/${id}`);
            return res.data as Registry;
        }
    });

    const handleFileDrop = async (file: File) => {
        if (!registry?.parameters || registry.parameters.length === 0) {
            window.alert('⚠️ Extraction Failed: No parameters defined for this registry. Please add the variables you want to extract in the "Parameters" tab first.');
            setDroppedFile(null);
            return;
        }
        setDroppedFile(file);
    };

    const { data: customerRecords = [] } = useQuery({
        queryKey: ['registry-customers', id],
        queryFn: async () => {
            const res = await api.get(`/buckets/${id}/customer`);
            return res.data as Record[];
        }
    });

    const { data: latestBatch } = useQuery({
        queryKey: ['registry-latest-batch', id],
        queryFn: async () => {
            const res = await api.get(`/buckets/${id}/batch/latest`);
            return res.data;
        }
    });

    const { data: syncLogs = [] } = useQuery({
        queryKey: ['registry-batches', id],
        queryFn: async () => {
            const res = await api.get(`/buckets/${id}/batches`);
            return res.data as SyncLog[];
        }
    });

    const { data: stagingRecords = [] } = useQuery({
        queryKey: ['registry-staging', id, latestBatch?._id],
        queryFn: async () => {
            const res = await api.get(`/buckets/${id}/staging`);
            return res.data as Record[];
        },
        enabled: !!latestBatch?._id,
    });

    const { data: user } = useQuery({
        queryKey: ['user-me'],
        queryFn: async () => {
            const res = await api.get('/auth/me');
            return res.data;
        }
    });

    // Mutations
    const syncMutation = useMutation({
        mutationFn: (filters: any) => api.post(`/buckets/${id}/sync`, { filters }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registry-latest-batch', id] });
            queryClient.invalidateQueries({ queryKey: ['registry-batches', id] });
            queryClient.invalidateQueries({ queryKey: ['registry', id] });
            queryClient.invalidateQueries({ queryKey: ['user-me'] }); // Refresh tokens
            setActiveTab('processed');
            setShowSyncModal(false);
        },
        onError: (err: AxiosError<any>) => {
            if (err.response?.status === 403) {
                window.alert(err.response.data.error || 'Insufficient tokens. Please recharge.');
            } else {
                window.alert('Sync failed. Please check your connection.');
            }
        }
    });

    const commitMutation = useMutation({
        mutationFn: () => api.post(`/buckets/${id}/batches/${latestBatch?._id}/commit`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registry-latest-batch', id] });
            queryClient.invalidateQueries({ queryKey: ['registry-batches', id] });
            queryClient.invalidateQueries({ queryKey: ['registry-staging', id] });
            queryClient.invalidateQueries({ queryKey: ['registry-customers', id] });
        }
    });

    const rejectMutation = useMutation({
        mutationFn: () => api.delete(`/buckets/${id}/batches/${latestBatch?._id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registry-latest-batch', id] });
            queryClient.invalidateQueries({ queryKey: ['registry-batches', id] });
            queryClient.invalidateQueries({ queryKey: ['registry-staging', id] });
        }
    });

    const updateSettingsMutation = useMutation({
        mutationFn: (parameters: any[]) => api.put(`/buckets/${id}/settings`, { parameters }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registry', id] });
            queryClient.invalidateQueries({ queryKey: ['user-me'] }); // Refresh tokens
        },
        onError: (err: AxiosError<any>) => {
            if (err.response?.status === 403) {
                window.alert(err.response.data.error || 'Insufficient tokens.');
                // Revert settings in UI if needed, but since we use registry from query, it will just re-fetch on next query invalidate
                queryClient.invalidateQueries({ queryKey: ['registry', id] });
            }
        }
    });

    const addParameter = () => {
        if (!newParameter.name) return;
        const currentParams = registry?.parameters || [];
        updateSettingsMutation.mutate([...currentParams, newParameter]);
        setNewParameter({ name: '', type: 'text', mapping: '' });
    };

    const removeParameter = (index: number) => {
        const currentParams = registry?.parameters || [];
        const updatedParams = currentParams.filter((_, i) => i !== index);
        updateSettingsMutation.mutate(updatedParams);
    };

    if (loadingRegistry) return (
        <div className="flex flex-col h-screen items-center justify-center bg-background space-y-6">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center animate-pulse">
                <Layers className="w-5 h-5 text-white" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 animate-pulse">Synchronizing Node</p>
        </div>
    );

    const getDisplayColumns = (recs: Record[]) => {
        const params = registry?.parameters || [];
        const paramResult = params.map(p => p.mapping || p.name);
        let discovered: string[] = [];
        if (recs.length > 0 && recs[0].data) {
            discovered = Object.keys(recs[0].data).filter(k =>
                !['_id', '__v'].includes(k) && !paramResult.includes(k)
            );
        }
        return [...paramResult, ...discovered];
    };

    const renderSyncLogs = () => (
        <div className="mt-12 space-y-6">
            <div className="flex items-center justify-between px-8">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    Ingestion Logs
                </h3>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{syncLogs.length} Streams Processed</span>
            </div>

            <div className="mx-8 space-y-4">
                <div
                    className="bg-white rounded-[1.5rem] border border-slate-200 overflow-auto shadow-sm custom-scrollbar max-h-[500px]"
                >
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <th className="p-5 px-6 border-b border-slate-200 min-w-[200px]">Timestamp</th>
                                <th className="p-5 px-6 border-b border-slate-200 min-w-[150px]">Sequence ID</th>
                                <th className="p-5 px-6 border-b border-slate-200 min-w-[150px]">Payload Size</th>
                                <th className="p-5 px-6 border-b border-slate-200 min-w-[150px]">Error Rate</th>
                                <th className="p-5 px-6 border-b border-slate-200 min-w-[300px]">Parameters</th>
                                <th className="p-5 px-6 border-b border-slate-200 min-w-[150px]">State</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {syncLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-xs font-medium text-slate-400">No telemetry recorded.</td>
                                </tr>
                            ) : syncLogs.map(log => (
                                <tr key={log._id} className="group hover:bg-slate-50 transition-colors">
                                    <td className="p-5 px-6 text-xs font-bold text-slate-900 border-b border-slate-50/50">
                                        {new Date(log.createdAt).toLocaleString()}
                                    </td>
                                    <td className="p-5 px-6 text-[10px] font-mono font-bold text-slate-400 border-b border-slate-50/50">
                                        {log._id.slice(-8).toUpperCase()}
                                    </td>
                                    <td className="p-5 px-6 text-xs font-semibold text-slate-600 border-b border-slate-50/50">
                                        {log.recordCount} records
                                    </td>
                                    <td className="p-5 px-6 border-b border-slate-50/50">
                                        <span className={clsx(
                                            "text-xs font-bold",
                                            log.conflictCount > 0 ? "text-red-500" : "text-emerald-500"
                                        )}>
                                            {log.conflictCount} conflicts
                                        </span>
                                    </td>
                                    <td className="p-5 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-tight border-b border-slate-50/50 truncate max-w-[300px]">
                                        {log.filters?.states?.length && log.filters.states.length > 0 ? log.filters.states.join(', ') : 'Global Stream'}
                                    </td>
                                    <td className="p-5 px-6 border-b border-slate-50/50">
                                        <div className={clsx(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide",
                                            log.status === 'pending' ? "bg-amber-50 text-amber-600" :
                                                log.status === 'committed' ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                                        )}>
                                            <div className={clsx(
                                                "w-1.5 h-1.5 rounded-full",
                                                log.status === 'pending' ? "bg-amber-600" :
                                                    log.status === 'committed' ? "bg-emerald-600" : "bg-slate-400"
                                            )} />
                                            {log.status}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderTable = (records: Record[], isStaging: boolean) => {
        const columns = getDisplayColumns(records);
        if (records.length === 0 && !isStaging) return (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-[1.5rem] border border-slate-200 m-8 shadow-sm">
                <Database className="w-10 h-10 text-slate-100 mb-4" />
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">No Core Intelligence</h3>
                <p className="text-slate-400 text-xs mt-1 max-w-sm font-medium">This registry node has no records committed to the master register yet.</p>
                <button
                    onClick={() => setShowSyncModal(true)}
                    className="mt-6 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-slate-900/10"
                >
                    Initialize Sync
                </button>
            </div>
        );

        if (records.length === 0 && isStaging) return null;

        return (
            <div className="mx-8 space-y-4">
                <style>
                    {`
                        .custom-scrollbar::-webkit-scrollbar {
                            height: 6px;
                            width: 6px;
                        }
                        .custom-scrollbar::-webkit-scrollbar-track {
                            background: transparent;
                        }
                        .custom-scrollbar::-webkit-scrollbar-thumb {
                            background: #e2e8f0;
                            border-radius: 10px;
                        }
                        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                            background: #cbd5e1;
                        }
                    `}
                </style>

                <div
                    className="bg-white rounded-[1.5rem] border border-slate-200 overflow-auto shadow-sm custom-scrollbar max-h-[600px]"
                >
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                {isStaging && <th className="p-5 px-6 border-b border-slate-200">Validation</th>}
                                {columns.map(col => <th key={col} className="p-5 px-6 whitespace-nowrap border-b border-slate-200 min-w-[200px]">{col}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {records.map((rec, i) => (
                                <tr key={rec._id || i} className="group hover:bg-slate-50 transition-colors">
                                    {isStaging && (
                                        <td className="p-5 px-6 border-b border-slate-50/50">
                                            <div className={clsx(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide",
                                                rec.status === 'conflict' ? "bg-red-50 text-red-600 border border-red-100" : "bg-blue-50 text-blue-600 border border-blue-100"
                                            )}>
                                                <div className={clsx("w-1.5 h-1.5 rounded-full", rec.status === 'conflict' ? "bg-red-600" : "bg-blue-600")} />
                                                {rec.status === 'conflict' ? 'Conflict' : 'Valid'}
                                            </div>
                                        </td>
                                    )}
                                    {columns.map(col => (
                                        <td key={col} className="p-5 px-6 whitespace-nowrap max-w-sm truncate text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors border-b border-slate-50/50">
                                            {typeof rec.data[col] === 'object' ? JSON.stringify(rec.data[col]) : (rec.data[col] === "" || rec.data[col] === null ? '-' : rec.data[col])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className="min-h-[calc(100vh-8rem)] flex flex-col bg-background font-sans relative"
        >
            {/* Drag Overlay */}
            {dragActive && (
                <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-300">
                    <div className="w-full max-w-lg bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200 p-12 flex flex-col items-center text-center shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-8">
                            <Bot className="w-10 h-10 text-purple-600 animate-bounce" />
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 mb-3 uppercase tracking-tight">Drop files for deep extraction</h2>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Your file will be staged in the AI Assistant</p>
                    </div>
                </div>
            )}

            <header className="px-10 pt-6 pb-2 bg-white border-b border-slate-100">
                <div className="flex justify-between items-center mb-6 w-full">

                    <div className="flex items-center gap-6">
                        <Link to="/" className="w-10 h-10 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-all group/back bg-slate-50/50">
                            <ArrowLeft className="w-5 h-5 group-hover/back:-translate-x-0.5 transition-transform" />
                        </Link>

                        {/* Minimal Title Block */}
                        <div>
                            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{registry?.name}</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowSyncModal(true)}
                            className="text-slate-500 hover:text-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                        >
                            <Zap className="w-4 h-4" />
                            Sync Data
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-6">
                    <nav className="flex items-center gap-1 bg-slate-50/50 p-1 rounded-2xl border border-slate-100">
                        <TabButton
                            active={activeTab === 'agent'}
                            onClick={() => setActiveTab('agent')}
                            label="Assistant"
                            icon={Bot}
                        />
                        <TabButton
                            active={activeTab === 'customer'}
                            onClick={() => setActiveTab('customer')}
                            label="Records"
                            count={customerRecords.length}
                            icon={DataIcon}
                        />
                        <TabButton
                            active={activeTab === 'processed'}
                            onClick={() => setActiveTab('processed')}
                            label="Activity"
                            count={latestBatch ? stagingRecords.length : 0}
                            icon={Layers}
                        />
                        <TabButton
                            active={activeTab === 'settings'}
                            onClick={() => setActiveTab('settings')}
                            label="Settings"
                            icon={Settings}
                        />
                    </nav>

                    {activeTab === 'processed' && latestBatch && (
                        <div className="flex items-center gap-4 animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/50 rounded-lg border border-blue-100/50">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600">Live Stream: {latestBatch?._id.slice(-8).toUpperCase()}</span>
                                <div className="w-[1px] h-3 bg-blue-200 mx-1" />
                                <span className="text-[9px] font-bold text-blue-400">{stagingRecords.length} Packets</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => rejectMutation.mutate()}
                                    disabled={rejectMutation.isPending}
                                    className="px-3 py-1.5 text-slate-400 hover:text-red-500 font-bold text-[9px] uppercase tracking-widest transition-all"
                                >
                                    Discard
                                </button>
                                <button
                                    onClick={() => commitMutation.mutate()}
                                    disabled={commitMutation.isPending}
                                    className="px-4 py-1.5 bg-emerald-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md flex items-center gap-2"
                                >
                                    {commitMutation.isPending ? 'Committing...' : 'Commit'}
                                    <CheckCircle2 className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <main className="flex-1 w-full">
                {activeTab === 'settings' && (
                    <div className="max-w-5xl p-12 space-y-12 animate-in fade-in duration-500">
                        <div className="space-y-8">
                            <div className="flex items-center justify-between px-2">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">Schema Mapping</h3>
                                    <p className="text-slate-400 text-sm mt-1 font-medium">Define structural mappings unique to this node.</p>
                                </div>
                                <div className="p-2 text-slate-300">
                                    <Info className="w-5 h-5" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {registry?.parameters?.map((p, i) => {
                                    const isStandard = STANDARD_FIELDS.map(f => f.toLowerCase()).includes(p.name.toLowerCase());
                                    const TypeIcon = p.type === 'number' ? Hash : p.type === 'date' ? Calendar : p.type === 'boolean' ? Check : Type;

                                    return (
                                        <div key={i} className="bg-white p-6 rounded-[1.75rem] border border-slate-200 shadow-sm relative group hover:border-slate-400 transition-all duration-300">
                                            <button
                                                onClick={() => removeParameter(i)}
                                                disabled={updateSettingsMutation.isPending}
                                                className="absolute top-4 right-4 p-2 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-xl opacity-40 group-hover:opacity-100 transition-all disabled:opacity-50"
                                                title="Remove Parameter"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <div className="flex items-center gap-4 mb-6">
                                                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-slate-900 transition-colors duration-300">
                                                    <Layers className={clsx("w-5 h-5", isStandard ? "text-slate-900" : "text-slate-400 group-hover:text-white")} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-slate-900 uppercase tracking-wider">{p.name}</span>
                                                    {isStandard && <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest mt-0.5">Standard Field</span>}
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center text-[9px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                                                <div className="flex items-center gap-1.5">
                                                    <TypeIcon className="w-3 h-3" />
                                                    <span>Data Type</span>
                                                </div>
                                                <span className="text-slate-900 px-2 py-1 bg-slate-50 rounded-lg">{p.type}</span>
                                            </div>
                                        </div>
                                    );
                                })}

                                <div className="bg-slate-50/50 p-6 rounded-[1.75rem] border-2 border-dashed border-slate-200 space-y-5 hover:border-slate-300 hover:bg-white transition-all duration-300">
                                    <div className="flex flex-col gap-4">
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {['Employer', 'Amount', 'Date', 'Type', 'Notes'].map(f => (
                                                <button
                                                    key={f}
                                                    onClick={() => setNewParameter({ ...newParameter, name: f })}
                                                    className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 hover:border-slate-900 hover:text-slate-900 transition-all"
                                                >
                                                    + {f}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-1 gap-3">
                                            <input
                                                className="bg-white px-4 py-3 rounded-xl text-xs font-bold outline-none border border-slate-100 focus:border-slate-900 shadow-sm"
                                                placeholder="Field name (e.g. Phone Number, Age)"
                                                value={newParameter.name}
                                                onChange={e => setNewParameter({ ...newParameter, name: e.target.value })}
                                            />
                                        </div>
                                        <button
                                            onClick={addParameter}
                                            disabled={updateSettingsMutation.isPending || !newParameter.name}
                                            className="w-full py-3 bg-slate-900 text-white disabled:bg-slate-200 disabled:text-slate-400 rounded-xl text-xs font-bold border border-slate-200 shadow-md hover:bg-black transition-all duration-300 flex items-center justify-center gap-2 uppercase tracking-widest"
                                        >
                                            {updateSettingsMutation.isPending ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Detecting Type...
                                                </>
                                            ) : (
                                                <>
                                                    <Plus className="w-4 h-4" />
                                                    Add Parameter
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'processed' && (
                    <div className="animate-in fade-in duration-500 py-6 px-8 max-w-[1700px] mx-auto">
                        {latestBatch && (
                            <>
                                {stagingRecords.length > 0 && <div className="space-y-6">
                                    {renderTable(stagingRecords, true)}
                                    <div className="h-[1px] bg-slate-100 opacity-50 my-6" />
                                </div>}
                            </>
                        )}

                        <div className="animate-in slide-in-from-bottom-4 duration-700 delay-150">
                            {renderSyncLogs()}
                        </div>
                    </div>
                )}
                {activeTab === 'customer' && (
                    <div className="animate-in fade-in duration-500 pb-32 py-10">
                        {renderTable(customerRecords, false)}
                    </div>
                )}
                {activeTab === 'agent' && (
                    <div className="animate-in fade-in duration-500 w-full h-full">
                        <AIAgentView bucketId={id} userTokens={user?.tokens} initialFile={droppedFile} />
                    </div>
                )}
            </main >

            <SyncModal
                isOpen={showSyncModal}
                onClose={() => setShowSyncModal(false)}
                onSync={(filters: any) => syncMutation.mutate(filters)}
                isSyncing={syncMutation.isPending}
            />


        </div >
    );
};

export default RegistryView;

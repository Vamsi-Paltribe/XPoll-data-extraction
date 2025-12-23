import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import clsx from 'clsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import SyncModal from '../components/SyncModal';
import {
    Database, Layers, Settings, ChevronRight,
    ArrowLeft, Globe, Zap, Trash2, Plus, Database as DataIcon,
    ArrowUpRight, Info, CheckCircle2,
    Cpu,
    Clock
} from 'lucide-react';

const TabButton = ({ active, onClick, label, count, icon: Icon }) => (
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

const RegistryView = () => {
    const { id } = useParams();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('processed');
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [newParameter, setNewParameter] = useState({ name: '', type: 'text', mapping: '' });

    // Queries
    const { data: registry, isLoading: loadingRegistry } = useQuery({
        queryKey: ['registry', id],
        queryFn: async () => {
            const res = await api.get(`/buckets/${id}`);
            return res.data;
        }
    });

    const { data: customerRecords = [], isLoading: loadingCustomer } = useQuery({
        queryKey: ['registry-customers', id],
        queryFn: async () => {
            const res = await api.get(`/buckets/${id}/customer`);
            return res.data;
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
            return res.data;
        }
    });

    const { data: stagingRecords = [] } = useQuery({
        queryKey: ['registry-staging', id, latestBatch?._id],
        queryFn: async () => {
            const res = await api.get(`/buckets/${id}/staging`);
            return res.data;
        },
        enabled: !!latestBatch?._id,
    });

    // Mutations
    const syncMutation = useMutation({
        mutationFn: (filters) => api.post(`/buckets/${id}/sync`, { filters }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registry-latest-batch', id] });
            queryClient.invalidateQueries({ queryKey: ['registry-batches', id] });
            queryClient.invalidateQueries({ queryKey: ['registry', id] });
            queryClient.invalidateQueries({ queryKey: ['user-me'] }); // Refresh tokens
            setActiveTab('processed');
            setShowSyncModal(false);
        },
        onError: (err) => {
            if (err.response?.status === 403) {
                alert(err.response.data.error || 'Insufficient tokens. Please recharge.');
            } else {
                alert('Sync failed. Please check your connection.');
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
        mutationFn: (parameters) => api.put(`/buckets/${id}/settings`, { parameters }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registry', id] });
            queryClient.invalidateQueries({ queryKey: ['user-me'] }); // Refresh tokens
        },
        onError: (err) => {
            if (err.response?.status === 403) {
                alert(err.response.data.error || 'Insufficient tokens.');
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

    const removeParameter = (idx) => {
        const currentParams = registry?.parameters || [];
        updateSettingsMutation.mutate(currentParams.filter((_, i) => i !== idx));
    };

    if (loadingRegistry) return (
        <div className="flex flex-col h-screen items-center justify-center bg-background space-y-6">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center animate-pulse">
                <Layers className="w-5 h-5 text-white" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 animate-pulse">Synchronizing Node</p>
        </div>
    );

    const getDisplayColumns = (recs) => {
        const params = registry?.parameters || [];
        const paramResult = params.map(p => p.mapping || p.name);
        let discovered = [];
        if (recs.length > 0 && recs[0].data) {
            discovered = Object.keys(recs[0].data).filter(k =>
                !['_id', '__v'].includes(k) && !paramResult.includes(k)
            );
        }
        return [...paramResult, ...discovered];
    };

    const renderSyncLogs = () => (
        <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between px-8">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    Ingestion Logs
                </h3>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{syncLogs.length} Streams Processed</span>
            </div>
            <div className="bg-white rounded-[1.5rem] border border-slate-200 overflow-hidden shadow-sm mx-8 mb-20">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                            <tr>
                                <th className="p-5 px-6">Timestamp</th>
                                <th className="p-5 px-6">Sequence ID</th>
                                <th className="p-5 px-6">Payload Size</th>
                                <th className="p-5 px-6">Error Rate</th>
                                <th className="p-5 px-6">Parameters</th>
                                <th className="p-5 px-6">State</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {syncLogs.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="p-12 text-center text-xs font-medium text-slate-400">No telemetry recorded.</td>
                                </tr>
                            ) : syncLogs.map(log => (
                                <tr key={log._id} className="group hover:bg-slate-50 transition-colors">
                                    <td className="p-5 px-6 text-xs font-bold text-slate-900">
                                        {new Date(log.createdAt).toLocaleString()}
                                    </td>
                                    <td className="p-5 px-6 text-[10px] font-mono font-bold text-slate-400">
                                        {log._id.slice(-8).toUpperCase()}
                                    </td>
                                    <td className="p-5 px-6 text-xs font-semibold text-slate-600">
                                        {log.recordCount} records
                                    </td>
                                    <td className="p-5 px-6">
                                        <span className={clsx(
                                            "text-xs font-bold",
                                            log.conflictCount > 0 ? "text-red-500" : "text-emerald-500"
                                        )}>
                                            {log.conflictCount} conflicts
                                        </span>
                                    </td>
                                    <td className="p-5 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                        {log.filters?.states?.length > 0 ? log.filters.states.join(', ') : 'Global Stream'}
                                    </td>
                                    <td className="p-5 px-6">
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

    const renderTable = (records, isStaging) => {
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
            <div className="bg-white rounded-[1.5rem] border border-slate-200 overflow-hidden shadow-sm mx-8">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                            <tr>
                                {isStaging && <th className="p-5 px-6">Validation</th>}
                                {columns.map(col => <th key={col} className="p-5 px-6 whitespace-nowrap">{col}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {records.map((rec, i) => (
                                <tr key={rec._id || i} className="group hover:bg-slate-50 transition-colors">
                                    {isStaging && (
                                        <td className="p-5 px-6">
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
                                        <td key={col} className="p-5 px-6 whitespace-nowrap max-w-sm truncate text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">
                                            {typeof rec.data[col] === 'object' ? JSON.stringify(rec.data[col]) : rec.data[col]}
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
        <div className="min-h-screen flex flex-col bg-background font-sans">
            <header className="px-10 pt-6 pb-2 bg-white border-b border-slate-100">
                <div className="flex justify-between items-center mb-6 w-full">
                    <div className="flex items-center gap-6">
                        <Link to="/" className="w-10 h-10 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-all group/back bg-slate-50/50">
                            <ArrowLeft className="w-5 h-5 group-hover/back:-translate-x-0.5 transition-transform" />
                        </Link>
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/10">
                                <Cpu className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400">
                                    <span>REGISTRY MONITOR</span>
                                    <ChevronRight className="w-2.5 h-2.5" />
                                    <span className="text-slate-900">NODE {registry?._id?.slice(-4).toUpperCase()}</span>
                                </div>
                                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{registry?.name}</h1>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="text-right flex flex-col items-end opacity-60">
                            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400">Last Telemetry</span>
                            <span className="text-[10px] font-bold text-slate-900">{registry?.lastSyncedAt ? new Date(registry.lastSyncedAt).toLocaleString() : 'PENDING'}</span>
                        </div>
                        <button
                            onClick={() => setShowSyncModal(true)}
                            className="bg-slate-900 text-white px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-slate-900/10 flex items-center gap-2 group"
                        >
                            <Zap className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" />
                            Sync Terminal
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <nav className="flex items-center gap-1">
                        <TabButton
                            active={activeTab === 'customer'}
                            onClick={() => setActiveTab('customer')}
                            label="Core Registry"
                            count={customerRecords.length}
                            icon={DataIcon}
                        />
                        <TabButton
                            active={activeTab === 'processed'}
                            onClick={() => setActiveTab('processed')}
                            label="Ingestion Stream"
                            count={latestBatch ? stagingRecords.length : 0}
                            icon={Layers}
                        />
                        <TabButton
                            active={activeTab === 'settings'}
                            onClick={() => setActiveTab('settings')}
                            label="Schema Config"
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
                                    disabled={rejectMutation.isLoading}
                                    className="px-3 py-1.5 text-slate-400 hover:text-red-500 font-bold text-[9px] uppercase tracking-widest transition-all"
                                >
                                    Discard
                                </button>
                                <button
                                    onClick={() => commitMutation.mutate()}
                                    disabled={commitMutation.isLoading}
                                    className="px-4 py-1.5 bg-emerald-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md flex items-center gap-2"
                                >
                                    {commitMutation.isLoading ? 'Committing...' : 'Commit'}
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
                                {registry?.parameters?.map((p, i) => (
                                    <div key={i} className="bg-white p-6 rounded-[1.75rem] border border-slate-200 shadow-sm relative group hover:border-slate-400 transition-all duration-300">
                                        <button
                                            onClick={() => removeParameter(i)}
                                            className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-slate-900 transition-colors duration-300">
                                                <Layers className="w-5 h-5 text-slate-400 group-hover:text-white" />
                                            </div>
                                            <span className="text-sm font-bold text-slate-900 uppercase tracking-wider">{p.name}</span>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-[9px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                                                <span>Data Type</span>
                                                <span className="text-slate-900">{p.type}</span>
                                            </div>
                                            <div className="px-4 py-2.5 bg-slate-50 rounded-xl text-[10px] font-mono font-bold text-slate-600 border border-slate-100 group-hover:border-slate-200 transition-all">
                                                {p.mapping || 'DIRECT_INHERIT'}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <div className="bg-slate-50/50 p-6 rounded-[1.75rem] border-2 border-dashed border-slate-200 space-y-5 hover:border-slate-300 hover:bg-white transition-all duration-300">
                                    <div className="grid grid-cols-1 gap-3">
                                        <input
                                            className="bg-white px-4 py-3 rounded-xl text-xs font-bold outline-none border border-slate-100 focus:border-slate-900 shadow-sm"
                                            placeholder="Field Label"
                                            value={newParameter.name}
                                            onChange={e => setNewParameter({ ...newParameter, name: e.target.value })}
                                        />
                                        <input
                                            className="bg-white px-4 py-3 rounded-xl text-xs font-bold outline-none border border-slate-100 focus:border-slate-900 shadow-sm"
                                            placeholder="Source Mapping"
                                            value={newParameter.mapping}
                                            onChange={e => setNewParameter({ ...newParameter, mapping: e.target.value })}
                                        />
                                    </div>
                                    <button
                                        onClick={addParameter}
                                        className="w-full py-3 bg-white text-slate-900 rounded-xl text-xs font-bold border border-slate-200 shadow-sm hover:border-slate-900 hover:text-white transition-all duration-300 flex items-center justify-center gap-2 uppercase tracking-widest"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Map Object
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'processed' && (
                    <div className="animate-in fade-in duration-500 py-6 px-8 max-w-[1700px] mx-auto">
                        {latestBatch ? (
                            <>
                                {stagingRecords.length > 0 && <div className="space-y-6">
                                    {renderTable(stagingRecords, true)}
                                    <div className="h-[1px] bg-slate-100 opacity-50 my-6" />
                                </div>}
                            </>
                        ) : (
                            <div className="mb-12">
                                <div className="bg-slate-50 border border-slate-200 rounded-[2.5rem] p-8 flex items-center justify-between">
                                    <div className="flex items-center gap-6">
                                        <div className="w-14 h-14 bg-white rounded-2xl border border-slate-200 flex items-center justify-center shadow-sm">
                                            <Zap className="w-6 h-6 text-slate-300" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Pipeline Terminal</h3>
                                            <p className="text-xs text-slate-400 font-medium mt-0.5">Telemetry synchronized. Initialize sync to fetch new ingestion batches.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowSyncModal(true)}
                                        className="px-8 py-3 bg-white border border-slate-200 text-slate-900 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:border-slate-900 transition-all shadow-sm"
                                    >
                                        Initialize Sync
                                    </button>
                                </div>
                            </div>
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
            </main>

            <SyncModal
                isOpen={showSyncModal}
                onClose={() => setShowSyncModal(false)}
                onSync={(filters) => syncMutation.mutate(filters)}
                isSyncing={syncMutation.isLoading}
            />
        </div>
    );
};

export default RegistryView;

import { useState } from 'react';
import api from '../services/api';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Plus,
    Database,
    Search,
    Clock, X,
    LayoutGrid, ChevronRight
} from 'lucide-react';

const Dashboard = () => {
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [newRegistry, setNewRegistry] = useState({ name: '', description: '' });
    const [searchQuery, setSearchQuery] = useState('');

    // Queries
    const { data: registries = [], isPending: isLoading } = useQuery({
        queryKey: ['registries'],
        queryFn: async () => {
            const res = await api.get('/buckets');
            return res.data as { _id: string; name: string; description?: string; recordCount?: number; lastSyncedAt?: string }[];
        }
    });

    // Mutations
    const createRegistryMutation = useMutation({
        mutationFn: (data: { name: string; description: string }) => api.post('/buckets', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registries'] });
            setShowModal(false);
            setNewRegistry({ name: '', description: '' });
        },
        onError: () => {
            window.alert('Failed to initialize registry');
        }
    });

    if (isLoading && registries.length === 0) return (
        <div className="flex flex-col h-screen items-center justify-center bg-background space-y-6">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center animate-pulse">
                <LayoutGrid className="w-5 h-5 text-white" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 animate-pulse">Initializing Monitor</p>
        </div>
    );

    return (
        <div className="min-h-[calc(100vh-8rem)] bg-background p-12">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Data Registries</h1>
                    <p className="text-slate-500 text-sm mt-1">Monitor and manage active system nodes and their ingestion streams.</p>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="flex-1 md:w-72 relative group">
                        <Search className="absolute left-4 top-3 w-4 h-4 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
                        <input
                            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 transition-all placeholder:text-slate-300 shadow-sm"
                            placeholder="Search active registries..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-slate-900 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-slate-900/10 flex items-center gap-2 group"
                    >
                        <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                        New Registry
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {registries
                    .filter(bucket => bucket.name.toLowerCase().includes(searchQuery.toLowerCase()) || bucket.description?.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(bucket => (
                        <Link
                            key={bucket._id}
                            to={`/registry/${bucket._id}`}
                            className="group bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:border-slate-400 transition-all duration-300 cursor-pointer h-[200px] flex flex-col"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-slate-900 transition-colors">
                                    <Database className="w-5 h-5 text-slate-400 group-hover:text-white" />
                                </div>
                                <span className="p-1 px-2.5 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-bold uppercase tracking-widest">Active</span>
                            </div>

                            <div className="flex-1">
                                <h4 className="text-base font-bold text-slate-900 tracking-tight mb-2 line-clamp-1">{bucket.name}</h4>
                                <div className="flex items-center gap-2">
                                    <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded-lg text-[10px] font-bold uppercase tracking-widest">
                                        {bucket.recordCount || 0} Records
                                    </span>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-slate-200" />
                                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                                        {bucket.lastSyncedAt ? new Date(bucket.lastSyncedAt).toLocaleDateString() : 'New'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-300 group-hover:text-slate-900 transition-colors">
                                    <span className="text-[10px] font-bold uppercase tracking-widest">View</span>
                                    <ChevronRight className="w-4 h-4" />
                                </div>
                            </div>
                        </Link>
                    ))}
            </div>

            {registries.length === 0 && !isLoading && (
                <div className="mt-20 flex flex-col items-center justify-center p-20 text-center bg-white rounded-[3rem] border border-slate-200 max-w-2xl mx-auto shadow-sm">
                    <div className="w-20 h-20 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mb-8 rotate-3">
                        <Database className="w-10 h-10 text-slate-200" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-3">No Nodes Active</h2>
                    <p className="text-slate-400 text-sm max-w-sm mb-10 leading-relaxed font-medium">There are currently no active data registries online. Initialize your first node to begin system ingestion.</p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20 hover:bg-black transition-all hover:-translate-y-1 active:translate-y-0"
                    >
                        Initialize Extraction
                    </button>
                </div>
            )}

            {/* Create Registry Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-md flex items-center justify-center z-[100] p-6 animate-in fade-in duration-300">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-modal max-w-xl w-full border border-slate-200 animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Deploy Node</h2>
                                <p className="text-slate-400 text-sm mt-1 font-medium">Configure core parameters for a new system registry.</p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 text-slate-300 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-8 mb-12">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Registry Label</label>
                                <input
                                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-200 shadow-sm"
                                    placeholder="e.g. Arizona_North_Core_V4"
                                    value={newRegistry.name}
                                    onChange={e => setNewRegistry({ ...newRegistry, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">System Metadata</label>
                                <textarea
                                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all h-36 resize-none placeholder:text-slate-200 shadow-sm"
                                    placeholder="Define operational boundaries and intended data types..."
                                    value={newRegistry.description}
                                    onChange={e => setNewRegistry({ ...newRegistry, description: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 px-6 py-4 text-xs font-bold text-slate-400 hover:text-slate-900 transition-all uppercase tracking-widest"
                            >
                                Discard
                            </button>
                            <button
                                onClick={() => createRegistryMutation.mutate(newRegistry)}
                                disabled={!newRegistry.name || createRegistryMutation.isPending}
                                className="flex-[2] px-6 py-4 bg-slate-900 text-white rounded-2xl text-xs font-bold uppercase tracking-widest transition-all hover:bg-black disabled:opacity-50 shadow-lg shadow-slate-900/10"
                            >
                                {createRegistryMutation.isPending ? 'Processing...' : 'Deploy Registry'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;

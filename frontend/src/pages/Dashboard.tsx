import { useState } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Plus,
    Database,
    Search,
    Clock, X,
    MoreHorizontal,
    ArrowUp,
    LayoutGrid
} from 'lucide-react';

const Dashboard = () => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [showModal, setShowModal] = useState(false);
    const [newRegistry, setNewRegistry] = useState({ name: '', description: '' });
    const [searchQuery, setSearchQuery] = useState('');

    // Queries
    const { data: user } = useQuery({
        queryKey: ['user-me'],
        queryFn: async () => {
            const res = await api.get('/auth/me');
            return res.data;
        }
    });

    const { data: registries = [], isPending: isLoading } = useQuery({
        queryKey: ['registries'],
        queryFn: async () => {
            const res = await api.get('/buckets');
            return res.data as { _id: string; name: string; description?: string; recordCount?: number; lastSyncedAt?: string, status?: 'active' | 'paused' }[];
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
        <div className="flex flex-col h-[80vh] items-center justify-center space-y-6">
            <div className="w-12 h-12 bg-[#2D384A] rounded-2xl flex items-center justify-center animate-pulse shadow-lg shadow-[#2D384A]/20">
                <LayoutGrid className="w-6 h-6 text-white" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 animate-pulse">Initializing Monitor</p>
        </div>
    );

    return (
        <div className="animate-in fade-in duration-500">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-[#2D384A] tracking-tight mb-2">Project Dashboard</h1>
                    <p className="text-slate-500 font-medium text-md">System operational. Welcome back.</p>
                </div>

                <div className="bg-white p-2 rounded-[24px] border border-slate-100 flex items-center gap-4 shadow-sm self-start md:self-auto pr-6">
                    <div className="w-12 h-12 bg-[#F7A25A]/10 rounded-2xl flex items-center justify-center text-[#F7A25A]">
                        <LayoutGrid strokeWidth={2.5} size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Token Balance</p>
                        <p className="text-xl font-extrabold text-[#2D384A]">{user?.tokens?.toLocaleString() || 0} <span className="text-xs text-slate-300 font-bold">TOKENS</span></p>
                    </div>
                </div>
            </header>

            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <h2 className="text-xl font-bold text-[#2D384A] flex items-center gap-3">
                    <Database size={24} className="text-[#A8328D]" />
                    Active Registries
                </h2>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative group flex-1 md:w-64">
                        <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400 group-focus-within:text-[#2D384A] transition-colors" />
                        <input
                            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-100 rounded-[20px] text-sm font-medium text-[#2D384A] outline-none focus:border-[#A8328D] focus:ring-4 focus:ring-[#A8328D]/5 transition-all placeholder:text-slate-300 shadow-sm"
                            placeholder="Search nodes..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-[#2D384A] text-white px-6 py-3 rounded-[20px] text-xs font-bold uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-[#2D384A]/10 flex items-center gap-2 group hover:-translate-y-1 active:translate-y-0"
                    >
                        <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                        Create Bucket
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pb-20">
                {registries
                    .filter(bucket => bucket.name.toLowerCase().includes(searchQuery.toLowerCase()) || bucket.description?.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(bucket => (
                        <div
                            key={bucket._id}
                            onClick={() => navigate(`/registry/${bucket._id}`)}
                            className="bg-white p-8 rounded-[32px] shadow-[0px_4px_20px_rgba(0,0,0,0.03)] border border-white/50 cursor-pointer hover:shadow-[0px_12px_40px_rgba(168,50,141,0.1)] hover:-translate-y-1.5 transition-all duration-300 group relative overflow-hidden"
                        >
                            {/* Hover Gradient Border Hint */}
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-[#A8328D] to-[#F7A25A] opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="flex justify-between items-start mb-8">
                                <div className="w-14 h-14 bg-[#f0f4f9] rounded-[22px] flex items-center justify-center text-[#2D384A] group-hover:bg-[#2D384A] group-hover:text-white transition-all duration-300 shadow-inner">
                                    <Database strokeWidth={1.5} size={26} />
                                </div>
                                <div className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${bucket.status === 'paused'
                                    ? "bg-slate-50 text-slate-400 border-slate-100"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                    }`}>
                                    {bucket.status || 'Active'}
                                </div>
                            </div>

                            <div className="mb-8">
                                <h3 className="text-lg font-bold text-[#2D384A] mb-2 group-hover:text-[#A8328D] transition-colors line-clamp-1">{bucket.name}</h3>
                                <p className="text-xs font-semibold text-slate-400 flex items-center gap-2 uppercase tracking-wide">
                                    <Clock size={12} className="text-[#F7A25A]" />
                                    {bucket.lastSyncedAt ? new Date(bucket.lastSyncedAt).toLocaleDateString() : 'New Node'}
                                </p>
                            </div>

                            <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Records</p>
                                    <p className="text-2xl font-bold text-[#2D384A] tracking-tight">{(bucket.recordCount || 0).toLocaleString()}</p>
                                </div>
                                <button className="w-10 h-10 rounded-full bg-[#F8F9FA] flex items-center justify-center text-slate-400 group-hover:bg-[#A8328D] group-hover:text-white transition-all duration-300 shadow-sm">
                                    <ArrowUp className="rotate-45" size={18} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>
                    ))}
            </div>

            {registries.length === 0 && !isLoading && (
                <div className="mt-20 flex flex-col items-center justify-center p-20 text-center bg-white rounded-[40px] border border-slate-100 max-w-2xl mx-auto shadow-sm">
                    <div className="w-24 h-24 bg-[#f0f4f9] rounded-[32px] flex items-center justify-center mb-8 rotate-3 shadow-inner">
                        <Database className="w-10 h-10 text-slate-300" />
                    </div>
                    <h2 className="text-2xl font-bold text-[#2D384A] tracking-tight mb-3">No Nodes Active</h2>
                    <p className="text-slate-400 text-sm max-w-sm mb-10 leading-relaxed font-medium">There are currently no active data registries online. Initialize your first node to begin system ingestion.</p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-10 py-5 bg-[#2D384A] text-white rounded-[24px] font-bold text-xs uppercase tracking-widest shadow-xl shadow-[#2D384A]/20 hover:bg-black transition-all hover:-translate-y-1 active:translate-y-0"
                    >
                        Initialize Extraction
                    </button>
                </div>
            )}

            {/* Create Registry Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-[#2D384A]/20 backdrop-blur-md flex items-center justify-center z-[100] p-6 animate-in fade-in duration-300">
                    <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-xl w-full border border-white animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h2 className="text-2xl font-bold text-[#2D384A] tracking-tight">Deploy Node</h2>
                                <p className="text-slate-400 text-sm mt-1 font-medium">Configure core parameters for a new system registry.</p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-3 text-slate-300 hover:text-[#2D384A] hover:bg-slate-50 rounded-2xl transition-all"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-8 mb-12">
                            <div className="space-y-3">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Registry Label</label>
                                <input
                                    className="w-full px-6 py-4 bg-[#f0f4f9] border border-transparent rounded-[24px] text-sm font-bold text-[#2D384A] outline-none focus:bg-white focus:border-[#2D384A] focus:ring-4 focus:ring-[#2D384A]/5 transition-all placeholder:text-slate-300"
                                    placeholder="e.g. Arizona_North_Core_V4"
                                    value={newRegistry.name}
                                    onChange={e => setNewRegistry({ ...newRegistry, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">System Metadata</label>
                                <textarea
                                    className="w-full px-6 py-4 bg-[#f0f4f9] border border-transparent rounded-[24px] text-sm font-bold text-[#2D384A] outline-none focus:bg-white focus:border-[#2D384A] focus:ring-4 focus:ring-[#2D384A]/5 transition-all h-36 resize-none placeholder:text-slate-300"
                                    placeholder="Define operational boundaries and intended data types..."
                                    value={newRegistry.description}
                                    onChange={e => setNewRegistry({ ...newRegistry, description: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 px-6 py-4 text-xs font-bold text-slate-400 hover:text-[#2D384A] transition-all uppercase tracking-widest"
                            >
                                Discard
                            </button>
                            <button
                                onClick={() => createRegistryMutation.mutate(newRegistry)}
                                disabled={!newRegistry.name || createRegistryMutation.isPending}
                                className="flex-[2] px-6 py-5 bg-[#2D384A] text-white rounded-[24px] text-xs font-bold uppercase tracking-widest transition-all hover:bg-black disabled:opacity-50 shadow-xl shadow-[#2D384A]/20"
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

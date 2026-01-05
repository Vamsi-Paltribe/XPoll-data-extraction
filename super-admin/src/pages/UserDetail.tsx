import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
    ArrowLeft,
    Database, Clock,
    Plus,
    X,
    ChevronRight,
    Table as TableIcon,
    RefreshCcw,
    Wallet,
    LayoutGrid,
    FileText,
    ArrowUpRight,
    ArrowDownLeft,
    Calendar,
    Upload,
    Edit2,
    Trash2,
    Save
} from 'lucide-react';
import clsx from 'clsx';
import DataImportModal from '../components/DataImportModal';

interface Bucket {
    _id: string;
    name: string;
    recordCount: number;
    lastSyncedAt?: string;
    lastSyncParams?: Record<string, any>;
}

interface MasterRecord {
    _id: string;
    data: Record<string, string>;
    updatedAt: string;
}

interface User {
    _id: string;
    name: string;
    email: string;
    bucketCount: number;
    tokens: number;
    usageCount: number;
}

interface RecordModalProps {
    bucket: Bucket;
    onClose: () => void;
}

const RecordModal: React.FC<RecordModalProps> = ({ bucket, onClose }) => {
    const queryClient = useQueryClient();

    const { data: records = [], isLoading } = useQuery<MasterRecord[]>({
        queryKey: ['admin-bucket-records', bucket._id],
        queryFn: async () => {
            const res = await api.get(`/admin/buckets/${bucket._id}/records`);
            return res.data;
        }
    });

    const syncMutation = useMutation({
        mutationFn: async () => {
            const res = await api.post(`/buckets/${bucket._id}/sync`, { filters: bucket.lastSyncParams || {} });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-bucket-records', bucket._id] });
            queryClient.invalidateQueries({ queryKey: ['admin-me'] });
            alert('Remote Sync Successful. Tokens deducted from Admin balance.');
        },
        onError: (err) => {
            alert(err.response?.data?.error || 'Sync failed');
        }
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-6xl h-[80vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
                <header className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-5">
                        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-900/10">
                            <TableIcon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 tracking-tight">{bucket.name}</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Registry Inspector</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => syncMutation.mutate()}
                            disabled={syncMutation.isPending}
                            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50"
                        >
                            <RefreshCcw className={clsx("w-3.5 h-3.5", syncMutation.isPending && "animate-spin")} />
                            {syncMutation.isPending ? 'Ingesting...' : 'Remote Sync'}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all hover:scale-95"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-8 custom-scrollbar bg-slate-50/20">
                    {isLoading ? (
                        <div className="h-full flex flex-col items-center justify-center space-y-4">
                            <div className="w-8 h-8 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Querying Master Registry</p>
                        </div>
                    ) : records.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center">
                            <Database className="w-12 h-12 text-slate-100 mb-4" />
                            <p className="text-slate-400 font-medium">No master records found in this node.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-[2rem] border border-slate-200 bg-white">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                                    <tr>
                                        {Object.keys(records[0]?.data || {}).map(key => (
                                            <th key={key} className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{key}</th>
                                        ))}
                                        <th className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Last Update</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {records.map(record => (
                                        <tr key={record._id} className="hover:bg-slate-50/50 transition-colors group">
                                            {Object.keys(record.data || {}).map(key => (
                                                <td key={key} className="px-6 py-5 text-[11px] font-medium text-slate-600">
                                                    {record.data[key]}
                                                </td>
                                            ))}
                                            <td className="px-6 py-5 text-right text-[10px] font-bold text-slate-300">
                                                {new Date(record.updatedAt).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <footer className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <span>{records.length} TOTAL RECORDS IDENTIFIED</span>
                    <div className="flex items-center gap-4">
                        <span className="text-slate-300">SYSTEM ID: {bucket._id}</span>
                    </div>
                </footer>
            </div>
        </div>
    );
};

interface LedgerEntry {
    _id: string;
    createdAt: string;
    userId?: { name: string; email: string };
    reason: string;
    bucketId?: { name: string };
    type: 'debit' | 'credit';
    amount: number;
}

interface UserLedgerProps {
    userId: string;
}

const UserLedger: React.FC<UserLedgerProps> = ({ userId }) => {
    const { data: ledger = [], isLoading } = useQuery<LedgerEntry[]>({
        queryKey: ['admin-user-ledger', userId],
        queryFn: async () => {
            const res = await api.get(`/admin/users/${userId}/ledger`);
            return res.data;
        }
    });

    if (isLoading) return (
        <div className="h-64 flex flex-col items-center justify-center space-y-4">
            <div className="w-6 h-6 border-2 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Loading Transaction History</p>
        </div>
    );

    if (ledger.length === 0) return (
        <div className="bg-white p-20 rounded-[2.5rem] border border-slate-200 text-center flex flex-col items-center">
            <FileText className="w-12 h-12 text-slate-100 mb-6" />
            <h4 className="text-base font-bold text-slate-900 tracking-tight">Clean Ledger</h4>
            <p className="text-slate-400 text-sm mt-1 max-w-[240px] font-medium leading-relaxed">No financial transactions recorded for this account.</p>
        </div>
    );

    return (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="p-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
                            <th className="p-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Operation</th>
                            <th className="p-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Context</th>
                            <th className="p-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {ledger.map(log => (
                            <tr key={log._id} className="group hover:bg-slate-50/50 transition-colors">
                                <td className="p-6">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-slate-300" />
                                        <span className="text-xs font-bold text-slate-600">
                                            {new Date(log.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </td>
                                <td className="p-6">
                                    <div className={clsx(
                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest",
                                        log.type === 'debit' ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                                    )}>
                                        {log.type === 'debit' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                                        {log.type.toUpperCase()}
                                    </div>
                                </td>
                                <td className="p-6">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-slate-900">{log.reason}</span>
                                        {log.bucketId && (
                                            <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                                                Bucket:{log.bucketId.name}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-6 text-right">
                                    <span className={clsx(
                                        "text-sm font-extrabold",
                                        log.type === 'debit' ? "text-slate-900" : "text-emerald-500"
                                    )}>
                                        {log.type === 'debit' ? '-' : '+'}{log.amount}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const UserDetail = () => {
    const { id } = useParams();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('inventory');
    const [rechargeAmount, setRechargeAmount] = useState('');
    const [selectedBucket, setSelectedBucket] = useState(null);
    const [showRecharge, setShowRecharge] = useState(false);

    const { data: buckets = [], isLoading: loadingBuckets } = useQuery({
        queryKey: ['admin-user-buckets', id],
        queryFn: async () => {
            const res = await api.get(`/admin/users/${id}/buckets`);
            return res.data;
        }
    });

    const { data: users = [] } = useQuery({
        queryKey: ['admin-users'],
        queryFn: async () => {
            const res = await api.get('/admin/users');
            return res.data;
        }
    });

    const user = users.find(u => u._id === id);

    const rechargeMutation = useMutation({
        mutationFn: (data) => api.post(`/admin/users/${id}/recharge`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
            alert('Recharge complete.');
        }
    });

    if (loadingBuckets || !user) return (
        <div className="p-8 h-[60vh] flex flex-col items-center justify-center space-y-6">
            <div className="w-8 h-8 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Extracting Profile Intel</p>
        </div>
    );

    return (
        <div className="p-4">
            <header className="flex justify-between items-center gap-6 mb-6 px-2">
                <div className='flex items-center gap-6'>
                    <Link to="/" className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-900 transition-all shadow-sm">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{user.name}</h1>
                        <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">{user.email}</p>
                    </div>
                </div>
                <div className="bg-slate-900 rounded-[2.5rem] p-4 shadow-2xl relative overflow-hidden transition-all duration-300 scale-90">
                    <div className="flex items-center justify-between gap-12">
                        <div className="flex items-center gap-4 pl-2">
                            <div className="w-12 h-12 bg-amber-400 rounded-2xl flex items-center justify-center">
                                <Wallet className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                                    Wallet Balance
                                </p>
                                <p className="text-2xl font-bold text-white">
                                    {user.tokens} <span className="text-sm font-bold text-slate-500">COINS</span>
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowRecharge(!showRecharge)}
                            className={clsx(
                                "py-3 px-6 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                                showRecharge ? "bg-slate-800 text-white" : "bg-white text-slate-900 hover:bg-slate-100"
                            )}
                        >
                            <Plus className={clsx("w-4 h-4 transition-transform", showRecharge && "rotate-45")} />
                            {showRecharge ? 'Cancel' : 'Add Funds'}
                        </button>
                    </div>

                    {showRecharge && (
                        <div className="mt-6 pt-6 border-t border-slate-800 animate-in slide-in-from-top-4 duration-300">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 pl-2">
                                Manual Crediting System
                            </p>
                            <div className="flex gap-3">
                                <input
                                    type="number"
                                    className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-5 py-3 text-sm font-bold text-white placeholder:text-slate-600 outline-none focus:border-amber-400 transition-all"
                                    placeholder="Amount..."
                                    value={rechargeAmount}
                                    onChange={(e) => setRechargeAmount(e.target.value)}
                                />
                                <button
                                    onClick={() => {
                                        rechargeMutation.mutate({ amount: rechargeAmount, reason: 'Manual Admin Credit' });
                                        setShowRecharge(false);
                                        setRechargeAmount('');
                                    }}
                                    className="px-6 py-3 bg-amber-400 text-slate-900 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-amber-300 transition-all shadow-lg shadow-amber-900/20"
                                >
                                    Authorize
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-8 items-start">
                {/* Sidebar Navigation */}
                <aside className="w-full lg:w-72 flex-shrink-0 space-y-4">
                    <div className="bg-white p-2 rounded-[2rem] border border-slate-200 shadow-sm sticky top-24">
                        <button
                            onClick={() => setActiveTab('inventory')}
                            className={clsx(
                                "w-full p-4 rounded-3xl flex items-center gap-4 transition-all duration-300 mb-2",
                                activeTab === 'inventory' ? "bg-slate-900 text-white shadow-md" : "hover:bg-slate-50 text-slate-400 hover:text-slate-900"
                            )}
                        >
                            <div className={clsx(
                                "w-10 h-10 rounded-2xl flex items-center justify-center transition-colors",
                                activeTab === 'inventory' ? "bg-white/10" : "bg-slate-100 group-hover:bg-white"
                            )}>
                                <LayoutGrid className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-bold tracking-tight">Registry Inventory</p>
                            </div>
                        </button>

                        <button
                            onClick={() => setActiveTab('ledger')}
                            className={clsx(
                                "w-full p-4 rounded-3xl flex items-center gap-4 transition-all duration-300",
                                activeTab === 'ledger' ? "bg-slate-900 text-white shadow-md" : "hover:bg-slate-50 text-slate-400 hover:text-slate-900"
                            )}
                        >
                            <div className={clsx(
                                "w-10 h-10 rounded-2xl flex items-center justify-center transition-colors",
                                activeTab === 'ledger' ? "bg-white/10" : "bg-slate-100 group-hover:bg-white"
                            )}>
                                <FileText className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-bold tracking-tight">Token Ledger</p>
                            </div>
                        </button>
                    </div>
                </aside>

                {/* Content Area */}
                <main className="flex-1 w-full min-w-0">
                    {activeTab === 'inventory' && (
                        <div className="space-y-6 animate-in fade-in duration-500">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                                <div className="bg-white p-6 rounded-[2rem] border border-slate-200">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Active Nodes</p>
                                    <p className="text-2xl font-bold text-slate-900">{user.bucketCount}</p>
                                </div>
                                <div className="bg-white p-6 rounded-[2rem] border border-slate-200">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Ops</p>
                                    <p className="text-2xl font-bold text-slate-900">{user.usageCount}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between px-2 mb-4">
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Active Databases</h3>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{buckets.length} Total</span>
                            </div>

                            {buckets.length === 0 ? (
                                <div className="bg-white p-20 rounded-[2.5rem] border border-slate-200 text-center flex flex-col items-center">
                                    <Database className="w-12 h-12 text-slate-100 mb-6" />
                                    <h4 className="text-base font-bold text-slate-900 tracking-tight">Empty Registry</h4>
                                    <p className="text-slate-400 text-sm mt-1 max-w-[240px] font-medium leading-relaxed">No data buckets associated with this account.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {buckets.map(bucket => (
                                        <div
                                            key={bucket._id}
                                            className="group bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:border-slate-400 transition-all duration-300 cursor-pointer h-[200px] flex flex-col"
                                            onClick={() => setSelectedBucket(bucket)}
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
                                                    <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold uppercase tracking-widest">
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
                                                    <span className="text-[10px] font-bold uppercase tracking-widest">Inspect</span>
                                                    <ChevronRight className="w-4 h-4" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'ledger' && (
                        <div className="animate-in fade-in duration-500">
                            <UserLedger userId={id} />
                        </div>
                    )}
                </main>
            </div>

            {selectedBucket && (
                <RecordModal
                    bucket={selectedBucket}
                    onClose={() => setSelectedBucket(null)}
                />
            )}
        </div>
    );
};

export default UserDetail;

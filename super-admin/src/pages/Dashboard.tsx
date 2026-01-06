import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
    Users,
    Database,
    Coins,
    Activity,
    TrendingUp,
    Search,
    ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

interface User {
    _id: string;
    name: string;
    email: string;
    bucketCount: number;
    tokens: number;
    usageCount: number;
    createdAt: string;
}

interface StatCardProps {
    label: string;
    value: number | string;
    icon: React.ElementType;
    color: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-6">
            <div className={clsx("p-4 rounded-2xl", color)}>
                <Icon className="w-6 h-6 text-white" />
            </div>
            <TrendingUp className="w-5 h-5 text-slate-200" />
        </div>
        <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">{label}</p>
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{value}</h3>
        </div>
    </div>
);

const Dashboard = () => {
    const { data: users = [], isLoading } = useQuery<User[]>({
        queryKey: ['admin-users'],
        queryFn: async () => {
            const res = await api.get('/admin/users');
            return res.data;
        }
    });

    const totalTokens = users.reduce((acc, u) => acc + (u.tokens || 0), 0);
    const totalBuckets = users.reduce((acc, u) => acc + (u.bucketCount || 0), 0);
    const totalUsage = users.reduce((acc, u) => acc + (u.usageCount || 0), 0);

    if (isLoading) return (
        <div className="p-8 h-[60vh] flex flex-col items-center justify-center space-y-6">
            <div className="w-8 h-8 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Syncing Admin Core</p>
        </div>
    );

    return (
        <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard label="Total Users" value={users.length} icon={Users} color="bg-blue-500" />
                <StatCard label="Circulating Tokens" value={totalTokens.toFixed(2)} icon={Coins} color="bg-amber-500" />
                <StatCard label="Active Buckets" value={totalBuckets} icon={Database} color="bg-emerald-500" />
                <StatCard label="Total Operations" value={totalUsage} icon={Activity} color="bg-slate-800" />
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Active Accounts</h2>
                        <p className="text-slate-400 text-sm mt-1 font-medium">Monitoring user status and resource utilization</p>
                    </div>
                    <div className="relative group w-80">
                        <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-300 group-focus-within:text-slate-900 transition-colors" />
                        <input
                            className="w-full pl-12 pr-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium outline-none focus:bg-white focus:border-slate-900 transition-all"
                            placeholder="Filter users..."
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="p-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Holder</th>
                                <th className="p-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Nodes</th>
                                <th className="p-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Coins</th>
                                <th className="p-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Usage</th>
                                <th className="p-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Joined</th>
                                <th className="p-6"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {users.map(user => (
                                <tr key={user._id} className="group hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-bold text-sm">
                                                {user.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-900">{user.name}</p>
                                                <p className="text-[11px] font-medium text-slate-400">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 text-center">
                                        <span className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold">{user.bucketCount}</span>
                                    </td>
                                    <td className="px-6 py-6 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <Coins className="w-3.5 h-3.5 text-amber-500" />
                                            <span className="text-sm font-extrabold text-slate-900">{user.tokens?.toFixed(2)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 text-center">
                                        <span className="text-xs font-bold text-slate-500">{user.usageCount} ops</span>
                                    </td>
                                    <td className="px-6 py-6">
                                        <span className="text-xs font-medium text-slate-400">{new Date(user.createdAt).toLocaleDateString()}</span>
                                    </td>
                                    <td className="px-6 py-6 text-right">
                                        <Link
                                            to={`/user/${user._id}`}
                                            className="inline-flex items-center gap-2 px-4 py-2 border border-black rounded-xl text-[10px] font-bold uppercase tracking-widest text-black hover:text-slate-900 hover:border-slate-900 transition-all"
                                        >
                                            Inspect
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>ī
            </div>
        </div>
    );
};

export default Dashboard;

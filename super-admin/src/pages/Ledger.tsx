import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
    ArrowUpRight,
    ArrowDownLeft,
    Calendar
} from 'lucide-react';
import clsx from 'clsx';

interface LedgerEntry {
    _id: string;
    createdAt: string;
    userId?: { name: string; email: string };
    reason: string;
    bucketId?: { name: string };
    type: 'debit' | 'credit';
    amount: number;
}

const Ledger = () => {
    const { data: ledger = [], isLoading } = useQuery<LedgerEntry[]>({
        queryKey: ['admin-ledger'],
        queryFn: async () => {
            const res = await api.get('/admin/ledger');
            return res.data;
        }
    });

    if (isLoading) return (
        <div className="p-4 h-[60vh] flex flex-col items-center justify-center space-y-6">
            <div className="w-8 h-8 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Reconstructing Audit Trail</p>
        </div>
    );

    return (
        <div className="p-4">
            <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 tracking-tight">System Vector Log</h2>
                        <p className="text-slate-400 text-xs mt-1 font-medium italic">Immutable history of all coin-based resource allocations across the platform.</p>
                    </div>
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Logs</span>
                            <span className="text-sm font-bold text-slate-900">{ledger.length} ENTRIES</span>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-10 py-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Timestamp</th>
                                <th className="px-10 py-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Account Origin</th>
                                <th className="px-10 py-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Operation Context</th>
                                <th className="px-10 py-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Direction</th>
                                <th className="px-10 py-6 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Delta</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {ledger.map(log => (
                                <tr key={log._id} className="group hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-6">
                                        <div className="flex items-center gap-3">
                                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="text-xs font-bold text-slate-600">
                                                {new Date(log.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-10 py-8">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-[10px] font-bold uppercase tracking-tighter">
                                                {log.userId?.name?.slice(0, 2).toUpperCase() || '??'}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-900">{log.userId?.name || 'Unknown'}</p>
                                                <p className="text-[10px] font-medium text-slate-400">{log.userId?.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-10 py-8">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-bold text-slate-900">{log.reason}</span>
                                            {log.bucketId && (
                                                <span className="text-[10px] font-bold text-slate-300 uppercase leading-none">
                                                    Bucket:{log.bucketId.name}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-10 py-8 text-right">
                                        <div className={clsx(
                                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest",
                                            log.type === 'debit' ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                                        )}>
                                            {log.type === 'debit' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                                            {log.type}
                                        </div>
                                    </td>
                                    <td className="px-10 py-8 text-right">
                                        <span className={clsx(
                                            "text-sm font-extrabold",
                                            log.type === 'debit' ? "text-slate-900" : "text-emerald-500"
                                        )}>
                                            {log.type === 'debit' ? '-' : '+'}{log.amount.toFixed(2)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Ledger;

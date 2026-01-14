import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
    ArrowUpRight,
    ArrowDownLeft,
    Wallet,
    History,
    Activity,
    Search
} from 'lucide-react';
import clsx from 'clsx';

interface LedgerEntry {
    _id: string;
    createdAt: string;
    type: 'debit' | 'credit';
    reason: string;
    amount: number;
    bucketId?: { name: string };
    bucketName?: string;
}

const Ledger = () => {
    const { data: user, isLoading: loadingUser } = useQuery({
        queryKey: ['user-me'],
        queryFn: async () => {
            const res = await api.get('/auth/me');
            return res.data;
        }
    });

    const { data: ledger = [], isLoading: loadingLedger } = useQuery({
        queryKey: ['user-ledger'],
        queryFn: async () => {
            const res = await api.get('/auth/ledger');
            return res.data as LedgerEntry[];
        }
    });

    if (loadingUser || loadingLedger) return (
        <div className="p-8 h-[60vh] flex flex-col items-center justify-center space-y-4 bg-[#EEEEEF]">
            <div className="w-10 h-10 border-4 border-[#2D384A]/10 border-t-[#A8328D] rounded-full animate-spin" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#2D384A]/60">Accessing Secure Ledger</p>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* TOP SECTION: TITLE & CONCISE TOKEN DISPLAY */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#2D384A] tracking-tight">Wallet Ledger</h1>
                    <p className="text-[#2D384A]/60 text-sm font-medium">Monitor your token consumption and balance history.</p>
                </div>

                <div className="bg-white border border-[#2D384A]/10 rounded-2xl p-4 shadow-sm flex items-center gap-4 min-w-[240px]">
                    <div className="w-12 h-12 bg-[#A8328D]/10 rounded-xl flex items-center justify-center">
                        <Wallet className="w-6 h-6 text-[#A8328D]" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-[#2D384A]/40 uppercase tracking-widest">Available Balance</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold text-[#2D384A]">{user?.tokens?.toLocaleString()}</span>
                            <span className="text-xs font-semibold text-[#A8328D]">TOKENS</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* QUICK STATS / FILTER BAR */}
            <div className="flex flex-wrap gap-3">
                <div className="bg-[#2D384A] text-[#EEEEEF] px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold">
                    <Activity className="w-3.5 h-3.5 text-[#A8328D]" />
                    {ledger.length} TOTAL TRANSACTIONS
                </div>
                <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D384A]/30" />
                    <input
                        type="text"
                        placeholder="Search transactions..."
                        className="w-full bg-white border border-[#2D384A]/10 rounded-xl py-2 pl-10 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-[#A8328D]/20 transition-all"
                    />
                </div>
            </div>

            {/* RECENT ACTIVITY TABLE */}
            <div className="bg-white rounded-2xl border border-[#2D384A]/10 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-[#2D384A]/5 bg-[#EEEEEF]/50 flex items-center gap-2">
                    <History className="w-4 h-4 text-[#2D384A]/40" />
                    <h2 className="text-xs font-bold text-[#2D384A] uppercase tracking-wider">Recent Activity</h2>
                </div>

                {ledger.length === 0 ? (
                    <div className="py-20 text-center">
                        <p className="text-sm font-medium text-[#2D384A]/40 italic">No activity recorded yet.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[#EEEEEF]/30">
                                    <th className="px-6 py-3 text-[10px] font-bold text-[#2D384A]/40 uppercase tracking-widest">Date & Time</th>
                                    <th className="px-6 py-3 text-[10px] font-bold text-[#2D384A]/40 uppercase tracking-widest">Type</th>
                                    <th className="px-6 py-3 text-[10px] font-bold text-[#2D384A]/40 uppercase tracking-widest">Description</th>
                                    <th className="px-6 py-3 text-[10px] font-bold text-[#2D384A]/40 uppercase tracking-widest text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#2D384A]/5">
                                {ledger.map((log: LedgerEntry) => (
                                    <tr key={log._id} className="group hover:bg-[#EEEEEF]/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-[#2D384A]">
                                                    {new Date(log.createdAt).toLocaleDateString()}
                                                </span>
                                                <span className="text-[10px] font-medium text-[#2D384A]/40">
                                                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className={clsx(
                                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold tracking-tight",
                                                log.type === 'debit'
                                                    ? "bg-[#2D384A]/5 text-[#2D384A]"
                                                    : "bg-[#A8328D]/10 text-[#A8328D]"
                                            )}>
                                                {log.type === 'debit' ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownLeft className="w-2.5 h-2.5" />}
                                                {log.type.toUpperCase()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-[#2D384A] leading-tight">{log.reason}</span>
                                                {(log.bucketName || log.bucketId?.name) && (
                                                    <span className="text-[10px] font-bold text-[#A8328D] uppercase mt-0.5 opacity-80">
                                                        Bucket: {log.bucketName || log.bucketId?.name}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={clsx(
                                                "text-sm font-bold font-mono",
                                                log.type === 'debit' ? "text-[#2D384A]" : "text-[#A8328D]"
                                            )}>
                                                {log.type === 'debit' ? '-' : '+'}{log.amount.toLocaleString()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Ledger;
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
    ArrowUpRight,
    ArrowDownLeft,
    Calendar,
    Wallet,
    CreditCard
} from 'lucide-react';
import clsx from 'clsx';

const Ledger = () => {
    // Fetch User Data for Balance
    const { data: user, isLoading: loadingUser } = useQuery({
        queryKey: ['user-me'],
        queryFn: async () => {
            const res = await api.get('/auth/me');
            return res.data;
        }
    });

    // Fetch Ledger History
    const { data: ledger = [], isLoading: loadingLedger } = useQuery({
        queryKey: ['user-ledger'],
        queryFn: async () => {
            const res = await api.get('/auth/ledger');
            return res.data;
        }
    });

    if (loadingUser || loadingLedger) return (
        <div className="p-8 h-[60vh] flex flex-col items-center justify-center space-y-6">
            <div className="w-8 h-8 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Loading Wallet</p>
        </div>
    );


    return (
        <div className="max-w-5xl mx-auto">
            <header className="mb-6">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">My Wallet</h1>
                <p className="text-slate-500 font-medium">Manage your token balance and view transaction history.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-6">
                {/* Balance Card */}
                <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden text-white flex flex-col justify-between h-[280px]">
                    <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-amber-400 opacity-[0.15] rounded-full translate-x-1/3 -translate-y-1/3 blur-[80px]" />

                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-sm">
                            <Wallet className="w-6 h-6 text-white" />
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Available Balance</p>
                        <h2 className="text-5xl font-bold tracking-tight">{user.tokens} <span className="text-2xl text-slate-500">TOKENS</span></h2>
                    </div>

                    <div className="relative z-10 pt-6 border-t border-white/10">
                        <p className="text-xs text-slate-400 font-medium">
                            Use tokens to sync data and unlock features. Contact admin to refill.
                        </p>
                    </div>
                </div>

                {/* Stats / Info */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 h-full flex flex-col justify-center items-center text-center">
                        <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center mb-6">
                            <CreditCard className="w-8 h-8 text-emerald-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Transaction History</h3>
                        <p className="text-slate-500 max-w-md mx-auto">
                            A complete record of all your data syncs, parameter additions, and admin recharges.
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-8 border-b border-slate-100 bg-slate-50/30">
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">Recent Activity</h2>
                </div>

                {ledger.length === 0 ? (
                    <div className="p-16 text-center flex flex-col items-center">
                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                            <Calendar className="w-6 h-6 text-slate-300" />
                        </div>
                        <p className="text-slate-400 font-medium">No transactions found.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
                                    <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</th>
                                    <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</th>
                                    <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {ledger.map(log => (
                                    <tr key={log._id} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="px-8 py-6">
                                            <span className="text-xs font-bold text-slate-500">
                                                {new Date(log.createdAt).toLocaleDateString()}
                                                <span className="text-[10px] font-medium text-slate-300 ml-2">
                                                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </span>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className={clsx(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest",
                                                log.type === 'debit' ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                                            )}>
                                                {log.type === 'debit' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                                                {log.type === 'debit' ? 'SPENT' : 'ADDED'}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-slate-900">{log.reason}</span>
                                                {log.bucketId && (
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                                                        Bucket:{log.bucketId.name}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <span className={clsx(
                                                "text-base font-extrabold",
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
                )}
            </div>
        </div>
    );
};

export default Ledger;

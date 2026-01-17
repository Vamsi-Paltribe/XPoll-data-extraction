import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/utils';
import {
    LogOut,
    Database,
    LayoutGrid,
    Wallet,
    Coins
} from 'lucide-react';
import { useAuth } from '@/hooks';

interface LayoutProps {
    children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
    const { user } = useAuth();

    const location = useLocation();
    const isDashboard = location.pathname === '/';
    const isLedger = location.pathname.startsWith('/ledger');

    return (
        <div className="flex flex-col min-h-screen bg-background text-slate-900 font-sans">
            {/* Top Navbar */}
            <header className="h-20 bg-white border-b border-slate-200 flex items-center px-12 sticky top-0 z-50">
                <div className="max-w-full mx-auto w-full flex items-center justify-between">
                    <div className="flex items-center gap-10">
                        <Link to="/" className="flex items-center gap-3 group">
                            <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/10 group-hover:scale-95 transition-all">
                                <Database className="w-4 h-4 text-white" />
                            </div>
                            <h1 className="text-base font-bold tracking-tight text-slate-900">
                                X-POLL <span className="text-slate-400">REGISTRY</span>
                            </h1>
                        </Link>
                    </div>

                    <div className="flex items-center gap-8">
                        {user && (
                            <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl shadow-sm animate-in fade-in duration-500">
                                <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center">
                                    <Coins className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest leading-none mb-1">Balance</p>
                                    <p className="text-sm font-extrabold text-amber-700 leading-none">{user.tokens} <span className="text-[10px]">COINS</span></p>
                                </div>
                            </div>
                        )}
                        <Link to="/" className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all group",
                            isDashboard ? "text-slate-900 bg-slate-50" : "text-slate-400 hover:text-slate-900 hover:bg-slate-50"
                        )}>
                            <LayoutGrid className={cn("w-5 h-5 transition-transform", !isDashboard && "group-hover:scale-110")} />
                            <span className="uppercase tracking-widest text-[10px]">Dashboard</span>
                        </Link>

                        <Link to="/ledger" className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all group",
                            isLedger ? "text-slate-900 bg-slate-50" : "text-slate-400 hover:text-slate-900 hover:bg-slate-50"
                        )}>
                            <Wallet className={cn("w-5 h-5 transition-transform", !isLedger && "group-hover:scale-110")} />
                            <span className="uppercase tracking-widest text-[10px]">Wallet & Ledger</span>
                        </Link>

                        <button
                            onClick={() => { window.localStorage.removeItem('token'); window.location.href = '/login' }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all group"
                        >
                            <LogOut className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                            <span className="font-bold text-[10px] uppercase tracking-widest">Logout</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                <div className="max-w-full mx-auto w-full">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;

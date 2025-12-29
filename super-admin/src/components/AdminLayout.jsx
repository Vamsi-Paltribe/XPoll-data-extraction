import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
    Shield, Coins,
    LogOut, Database, LayoutGrid, Wallet, UserPlus
} from 'lucide-react';
import clsx from 'clsx';

const AdminLayout = ({ children }) => {
    const location = useLocation();

    const { data: admin } = useQuery({
        queryKey: ['admin-me'],
        queryFn: async () => {
            const res = await api.get('/auth/me');
            return res.data;
        }
    });

    const handleLogout = () => {
        window.location.href = '/login';
    };

    const NavLink = ({ to, icon, label }) => (
        <Link
            to={to}
            className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                location.pathname === to
                    ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                    : "text-slate-400 hover:text-slate-900"
            )}
        >
            {icon}
            <span className="hidden lg:inline">{label}</span>
        </Link>
    );

    return (
        <div className="min-h-screen bg-background font-sans">
            {/* Admin Header */}
            <header className="h-20 bg-white border-b border-slate-200 sticky top-0 z-50 px-8">
                <div className="max-w-[1700px] mx-auto h-full flex items-center justify-between">
                    <div className="flex items-center gap-10">
                        <Link to="/" className="flex items-center gap-4 group">
                            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/10 group-hover:scale-95 transition-all">
                                <Shield className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-none">
                                    XPOLL <span className="text-slate-400 font-medium">TERMINAL</span>
                                </h1>
                            </div>
                        </Link>

                        <nav className="flex items-center gap-2 ml-8">
                            <NavLink to="/" icon={<LayoutGrid className="w-4 h-4" />} label="Command Center" />
                            <NavLink to="/manage" icon={<Database className="w-4 h-4" />} label="Manage Sheets" />
                            <NavLink to="/ledger" icon={<Wallet className="w-4 h-4" />} label="Financial Ledger" />
                            <NavLink to="/create-admin" icon={<UserPlus className="w-4 h-4" />} label="Add Admin" />
                        </nav>
                    </div>

                    <div className="flex items-center gap-8">
                        <div className="w-[1px] h-8 bg-slate-100" />
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 group bg-red-600 text-white px-3 py-2 rounded-xl cursor-pointer hover:bg-red-700 transition-colors"
                        >
                            <span className="text-xs font-bold tracking-widest hidden md:block">Logout</span>
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-[1700px] mx-auto">
                {children}
            </main>
        </div>
    );
};

export default AdminLayout;

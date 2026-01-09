import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import {
    Shield, LogOut, Database, LayoutGrid, Wallet, UserPlus, Clock, XCircle, FileText, CheckCircle, BellDot
} from 'lucide-react';
import clsx from 'clsx';

interface AdminLayoutProps {
    children: React.ReactNode;
}

interface NavLinkProps {
    to: string;
    icon: React.ReactNode;
    label: string;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [showNotifications, setShowNotifications] = React.useState(false);

    const { data: jobs } = useQuery({
        queryKey: ['jobs'],
        queryFn: async () => {
            const res = await api.get('/jobs');
            return res.data;
        },
        refetchInterval: 50000,
        enabled: true
    });

    const pendingReviewJobs = jobs?.filter((j: any) => j.status === 'waiting_approval') || [];

    const handleJobClick = (jobId: string) => {
        setShowNotifications(false);
        navigate(`/manage?reviewJobId=${jobId}`);
    };

    useQuery({
        queryKey: ['admin-me'],
        queryFn: async () => {
            const res = await api.get('/auth/me');
            return res.data;
        }
    });

    const handleLogout = () => {
        window.location.href = '/login';
    };

    const NavLink: React.FC<NavLinkProps> = ({ to, icon, label }) => (
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
                <div className="mx-auto h-full flex items-center justify-between">
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
                        {/* Notification Bell */}
                        <div className="relative">
                            <button
                                onClick={() => setShowNotifications(true)}
                                className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
                            >
                                <BellDot className="w-6 h-6" />
                                {pendingReviewJobs.length > 0 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full ring-2 ring-white animate-pulse">
                                        {pendingReviewJobs.length}
                                    </span>
                                )}
                            </button>
                        </div>

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

            <main className="mx-auto">
                {children}
            </main>

            {/* NOTIFICATION SIDEBAR */}
            {showNotifications && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    <div
                        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
                        onClick={() => setShowNotifications(false)}
                    />
                    <div className="relative w-full max-w-md bg-white h-full shadow-2xl p-6 flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-purple-600" />
                                Notifications
                            </h2>
                            <button onClick={() => setShowNotifications(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                                <XCircle className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        {pendingReviewJobs.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
                                <CheckCircle className="w-12 h-12 mb-4 opacity-20" />
                                <p className="font-medium">All caught up!</p>
                                <p className="text-sm opacity-70">No pending approvals.</p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto space-y-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Pending Approvals ({pendingReviewJobs.length})</p>
                                {pendingReviewJobs.map((job: any) => (
                                    <div
                                        key={job._id}
                                        onClick={() => handleJobClick(job._id)}
                                        className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:shadow-md hover:border-purple-200 hover:ring-1 hover:ring-purple-200 transition-all cursor-pointer group"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                                    <FileText className="w-4 h-4" />
                                                </div>
                                                <span className="font-bold text-slate-700 group-hover:text-purple-700 transition-colors line-clamp-1">
                                                    {job.originalName || job.fileName}
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-100">
                                                Review Needed
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-slate-500 pl-11">
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {new Date(job.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminLayout;

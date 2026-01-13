import { LogOut, Wallet, LayoutGrid } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';

const Sidebar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const activeRoute = location.pathname;

    const navItems = [
        { icon: LayoutGrid, label: 'Dashboard', path: '/' },
        { icon: Wallet, label: 'Wallet', path: '/ledger' },
    ];

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    return (
        <aside className="w-[88px] h-[98vh] fixed left-0 top-[1vh] bg-white/80 backdrop-blur-xl border border-white/20 flex flex-col items-center py-8 z-50 rounded-[32px] shadow-[0_8px_32px_rgba(0,0,0,0.08)]">

            {/* Brand Logo Container */}
            <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-12 cursor-pointer transition-transform hover:scale-105"
                onClick={() => navigate('/')}
            >
                <img
                    src="https://xpoll-landing-102025.nyc3.cdn.digitaloceanspaces.com/xpoll-logo.svg"
                    className="w-10 h-10"
                    alt="logo"
                />
            </div>

            {/* Navigation Menu */}
            <nav className="flex-1 flex flex-col gap-6 w-full px-4">
                {navItems.map((item) => {
                    const isActive = activeRoute === item.path;
                    return (
                        <button
                            key={item.label}
                            onClick={() => navigate(item.path)}
                            className={clsx(
                                "w-full aspect-square rounded-[22px] flex items-center justify-center transition-all duration-300 group relative",
                                // Active State: Reverse Colors (Dark BG, Light Icon)
                                isActive
                                    ? "bg-[#0B1F22] text-[#F6F8FA] shadow-lg shadow-[#0B1F22]/20 scale-105"
                                    : "bg-[#F6F8FA] text-[#0B1F22] hover:bg-white border border-transparent hover:border-slate-200"
                            )}
                        >
                            <item.icon strokeWidth={isActive ? 2.5 : 2} size={22} />

                            {/* Floating Professional Tooltip */}
                            <span className="absolute left-20 bg-[#0B1F22] text-[#F6F8FA] text-[11px] font-bold px-4 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-10px] group-hover:translate-x-0 whitespace-nowrap pointer-events-none shadow-2xl z-50">
                                {item.label}
                                {/* Tooltip Arrow */}
                                <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-[#0B1F22] rotate-45" />
                            </span>

                            {/* Active Indicator Line */}
                            {isActive && (
                                <div className="absolute -left-4 w-1 h-8 bg-[#0B1F22] rounded-r-full animate-in fade-in slide-in-from-left-1" />
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Bottom Logout Action */}
            <div className="flex flex-col gap-6 items-center w-full px-4">
                <button
                    onClick={handleLogout}
                    className="w-full aspect-square rounded-[22px] flex items-center justify-center text-red-500 bg-red-50/50 hover:bg-red-50 hover:scale-105 transition-all duration-300 group relative"
                >
                    <LogOut strokeWidth={2} size={22} />
                    <span className="absolute left-20 bg-red-600 text-white text-[11px] font-bold px-4 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap pointer-events-none shadow-xl">
                        Logout Session
                    </span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
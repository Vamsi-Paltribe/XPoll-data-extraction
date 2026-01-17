import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '@/services/api';
import BannerImage from '@/assets/xpoll.png';

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [error, setError] = useState('');

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const token = params.get('token');
        if (token) {
            localStorage.setItem('token', token);
            navigate('/');
        }
    }, [location, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await api.post('/auth/login', formData);
            localStorage.setItem('token', res.data.token);
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.msg || 'Login failed');
        }
    };

    const handleGoogleLogin = () => {
        window.location.href = `${api.defaults.baseURL}/auth/google`;
    };

    return (
        <div className="min-h-screen flex flex-col lg:flex-row lg:justify-center bg-[#000000]" >

            {/* Left Side: Login Form Container */}
            <div className="w-full lg:w-[35%] flex items-center justify-center p-6 z-10">
                <div className="w-full max-w-2xl animate-in slide-in-from-left duration-700">
                    <div className="bg-white p-10 lg:p-12 rounded-[40px] h-[85dvh] shadow-2xl shadow-black/10 relative overflow-hidden">

                        {/* Brand Header */}
                        <div className="mb-10 relative z-10 text-center">
                            <div className="rounded-2xl flex items-center justify-center mb-6 mx-auto">
                                <img src="https://xpoll-landing-102025.nyc3.cdn.digitaloceanspaces.com/xpoll-logo.svg" className="w-20 h-20" alt="logo" />
                            </div>
                            <h1 className="text-4xl font-extrabold text-[#2D384A] tracking-tight mb-2">Welcome Back.</h1>
                            <p className="text-slate-500 font-medium">Enter your credentials to access the intelligence terminal.</p>
                        </div>

                        {error && (
                            <div className="p-4 mb-6 text-xs font-bold text-red-600 bg-red-50 rounded-2xl border border-red-100 flex items-center gap-2 animate-in fade-in">
                                <div className="w-2 h-2 bg-red-500 rounded-full" />
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Work Email</label>
                                <input
                                    type="email"
                                    placeholder="name@organization.com"
                                    className="w-full px-8 py-5 bg-[#f0f4f9]/40 rounded-[24px] text-sm font-semibold text-[#2D384A] outline-none focus:bg-white focus:border-[#A8328D]/30 focus:ring-4 focus:ring-[#A8328D]/5 transition-all border border-transparent placeholder:text-slate-300"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center ml-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Password</label>
                                    <a href="#" className="text-[10px] font-bold text-[#A8328D] hover:underline">Forgot?</a>
                                </div>
                                <input
                                    type="text"
                                    placeholder="••••••••••••"
                                    className="w-full px-8 py-5 bg-[#f0f4f9]/40 rounded-[24px] text-sm font-semibold text-[#2D384A] outline-none focus:bg-white focus:border-[#A8328D]/30 focus:ring-4 focus:ring-[#A8328D]/5 transition-all border border-transparent placeholder:text-slate-300"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-5 bg-[#2D384A] text-white rounded-[24px] font-bold text-xs shadow-xl shadow-[#2D384A]/20 hover:bg-black transition-all hover:-translate-y-1 active:translate-y-0 uppercase tracking-widest mt-4"
                            >
                                Sign In
                            </button>
                        </form>

                        <div className="mt-8 relative z-10">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-slate-400 font-bold tracking-widest">Or continue with</span></div>
                        </div>

                        <div className="mt-8 relative z-10">
                            <button
                                onClick={handleGoogleLogin}
                                className="w-full py-4 bg-white text-[#2D384A] rounded-[24px] font-bold text-xs border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-3 uppercase tracking-widest"
                            >
                                System SSO Login
                            </button>
                        </div>

                        <p className="mt-10 text-center text-xs font-semibold text-slate-400">
                            Don't have an account? <a className="text-[#A8328D] hover:underline cursor-pointer">Request Access</a>
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Side: High-Impact Banner Section */}
            <div className="hidden lg:flex lg:w-[55%] relative bg-[#2D384A] overflow-hidden">
                <img
                    src={BannerImage}
                    className="w-full h-screen object-cover bg-cover opacity-90"
                    alt="XPoll Agentic Data Extraction"
                />
                {/* Optional: Dark Overlay for more professional consistency */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#2D384A]/10 to-transparent pointer-events-none" />
            </div>
        </div>
    );
};

export default Login;
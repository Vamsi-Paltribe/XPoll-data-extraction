import React, { useState } from 'react';
import api from '../services/api';
import { useMutation } from '@tanstack/react-query';
import { Zap, Mail, Lock, LogIn, Chrome as Google } from 'lucide-react';

const Login = () => {
    const [formData, setFormData] = useState({ email: '', password: '' });

    const loginMutation = useMutation({
        mutationFn: (data) => api.post('/auth/login', data),
        onSuccess: (res) => {
            localStorage.setItem('token', res.data.token);
            window.location.href = '/';
        },
        onError: () => {
            alert('Login Failed');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        loginMutation.mutate(formData);
    };

    const handleGoogleLogin = () => {
        window.location.href = 'http://localhost:5000/api/auth/google';
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50 font-sans selection:bg-slate-900 selection:text-white">
            <div className="p-12 md:p-16 bg-white rounded-[2.5rem] shadow-modal w-full max-w-xl border border-slate-200 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col items-center mb-12">
                    <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-900/10 mb-8">
                        <Zap className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-1">X-POLL</h2>
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 font-mono">Intelligence Terminal</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1">Authorized Email</label>
                        <div className="relative group">
                            <Mail className="absolute left-6 top-5 w-4 h-4 text-slate-300 group-focus-within:text-slate-900 transition-colors" />
                            <input
                                type="email"
                                placeholder="name@organization.com"
                                className="w-full pl-16 pr-8 py-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-200"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1">Security Key</label>
                        <div className="relative group">
                            <Lock className="absolute left-6 top-5 w-4 h-4 text-slate-300 group-focus-within:text-slate-900 transition-colors" />
                            <input
                                type="password"
                                placeholder="••••••••••••"
                                className="w-full pl-16 pr-8 py-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-200"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loginMutation.isLoading}
                        className="w-full bg-slate-900 text-white py-4 rounded-xl text-xs font-bold uppercase tracking-widest transition-all hover:bg-black active:scale-[0.98] shadow-lg shadow-slate-900/10 flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        {loginMutation.isLoading ? 'AUTHENTICATING...' : (
                            <>
                                ACCESS TERMINAL
                                <LogIn className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-10 flex items-center justify-between">
                    <div className="h-[1px] flex-1 bg-slate-100" />
                    <span className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.2em] px-6">System Identity</span>
                    <div className="h-[1px] flex-1 bg-slate-100" />
                </div>

                <button
                    onClick={handleGoogleLogin}
                    className="mt-10 w-full bg-white text-slate-900 py-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-sm active:scale-[0.98]"
                >
                    <Google className="w-4 h-4 text-slate-900" />
                    System SSO Login
                </button>

                <p className="mt-12 text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    &copy; 2024 X-POLL INTELLIGENCE SYSTEMS.
                </p>
            </div>
        </div>
    );
};

export default Login;

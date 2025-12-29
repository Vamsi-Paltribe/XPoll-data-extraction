import React, { useState } from 'react';
import api from '../services/api';
import { Shield, Lock, Mail, ArrowRight } from 'lucide-react';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/login', { email, password });
            // Check if user is admin
            if (!res.data.user.isAdmin) {
                setError('Access denied. Administrator privileges required.');
                setLoading(false);
                return;
            }
            localStorage.setItem('token', res.data.token);
            window.location.href = '/';
        } catch (err) {
            setError(err.response?.data?.msg || 'Invalid credentials');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
            <div className="max-w-md w-full">
                <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-slate-900 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-slate-900/20">
                        <Shield className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Super Admin Terminal</h1>
                    <p className="text-slate-400 text-sm mt-2 font-medium">Internal XPOLL & Oversight Protocol</p>
                </div>

                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Admin Email</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-4 w-4 h-4 text-slate-300 group-focus-within:text-slate-900 transition-colors" />
                                <input
                                    type="email"
                                    required
                                    className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-200"
                                    placeholder="admin@xpoll.system"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Security Key</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-4 w-4 h-4 text-slate-300 group-focus-within:text-slate-900 transition-colors" />
                                <input
                                    type="password"
                                    required
                                    className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-900 transition-all placeholder:text-slate-200"
                                    placeholder="••••••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-center">
                                <p className="text-[11px] font-bold text-red-600 uppercase tracking-wider">{error}</p>
                            </div>
                        )}

                        <button
                            disabled={loading}
                            type="submit"
                            className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-bold uppercase tracking-[0.2em] shadow-xl shadow-slate-900/10 hover:bg-black transition-all flex items-center justify-center gap-3 group"
                        >
                            {loading ? 'Authorizing...' : 'Initialize Session'}
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </form>
                </div>

                <p className="text-center mt-10 text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em]">
                    Restricted Access Area
                </p>
            </div>
        </div>
    );
};

export default Login;

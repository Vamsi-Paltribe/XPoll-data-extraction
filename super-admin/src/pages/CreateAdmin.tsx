import { useState } from 'react';
import { UserPlus, Shield, CheckCircle, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import api from '../services/api';

interface Status {
    type: 'success' | 'error' | '';
    msg: string;
}

const CreateAdmin = () => {
    const [formData, setFormData] = useState({ name: '', email: '', password: '' });
    const [status, setStatus] = useState<Status>({ type: '', msg: '' });
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatus({ type: '', msg: '' });

        try {
            await api.post('/admin/create-admin', formData);
            setStatus({ type: 'success', msg: `Successfully created account for ${formData.name}` });
            setFormData({ name: '', email: '', password: '' });
        } catch (err) {
            setStatus({
                type: 'error',
                msg: err.response?.data?.msg || 'An unexpected error occurred.'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-12 px-4">
            {/* Header Section */}
            <div className="mb-10 text-center">
                <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                    Add Administrator
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg">
                    Grant system-wide access to a new team member.
                </p>
            </div>

            {/* Form Card */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 md:p-10 transition-all">

                {/* Status Message */}
                {status.msg && (
                    <div className={`mb-8 p-4 rounded-2xl flex items-center gap-3 border animate-in fade-in slide-in-from-top-2 duration-300 ${status.type === 'success'
                        ? 'bg-green-50 border-green-100 text-green-700 dark:bg-green-900/10 dark:border-green-800 dark:text-green-400'
                        : 'bg-red-50 border-red-100 text-red-700 dark:bg-red-900/10 dark:border-red-800 dark:text-red-400'
                        }`}>
                        {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                        <span className="text-sm font-semibold">{status.msg}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 gap-6">
                        {/* Name Field */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider ml-1">
                                Full Name
                            </label>
                            <input
                                name="name"
                                type="text"
                                required
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="e.g. Alex Rivera"
                                className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-800 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all duration-200"
                            />
                        </div>

                        {/* Email Field */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider ml-1">
                                Email Address
                            </label>
                            <input
                                name="email"
                                type="email"
                                required
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="alex@company.com"
                                className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-800 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all duration-200"
                            />
                        </div>

                        {/* Password Field */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider ml-1">
                                Temporary Password
                            </label>
                            <div className="relative group">
                                <input
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={formData.password}
                                    onChange={handleChange}
                                    placeholder="••••••••••••"
                                    className="w-full px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-800 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all duration-200"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-blue-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-3 bg-gray-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-xl shadow-gray-200 dark:shadow-none transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {loading ? (
                                <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                                <>
                                    <UserPlus size={22} strokeWidth={2.5} />
                                    <span>Create Admin Account</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* Bottom Note */}
            <p className="mt-8 text-center text-sm text-gray-400">
                New administrators will receive an email to verify their account.
            </p>
        </div>
    );
};

export default CreateAdmin;
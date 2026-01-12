import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import backendApi from '../services/api';
import {
    Settings, Plus, Trash2, Save, AlertCircle, CheckCircle2,
    Type, Hash, Calendar, Info
} from 'lucide-react';
import clsx from 'clsx';

interface Parameter {
    name: string;
    type: 'text' | 'number' | 'date';
}

const GlobalSettingsPage: React.FC = () => {
    const queryClient = useQueryClient();
    const [parameters, setParameters] = useState<Parameter[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Fetch Global Schema
    const { data: schema, isLoading } = useQuery({
        queryKey: ['global-schema'],
        queryFn: async () => {
            const res = await backendApi.get('/admin/settings/global_schema');
            return res.data || [];
        }
    });

    useEffect(() => {
        if (schema) {
            setParameters(schema);
        }
    }, [schema]);

    // Save Mutation
    const saveMutation = useMutation({
        mutationFn: async (newSchema: Parameter[]) => {
            await backendApi.post('/admin/settings/global_schema', { value: newSchema });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['global-schema'] });
            setMessage({ type: 'success', text: 'Global schema updated successfully!' });
            setTimeout(() => setMessage(null), 3000);
        },
        onError: (err: any) => {
            setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save settings' });
        },
        onSettled: () => setIsSaving(false)
    });

    const addParameter = () => {
        setParameters([...parameters, { name: '', type: 'text' }]);
    };

    const removeParameter = (index: number) => {
        setParameters(parameters.filter((_, i) => i !== index));
    };

    const updateParameter = (index: number, field: keyof Parameter, value: string) => {
        const newParams = [...parameters];
        newParams[index] = { ...newParams[index], [field]: value };
        setParameters(newParams);
    };

    const handleSave = () => {
        // Validation
        const emptyParams = parameters.filter(p => !p.name.trim());
        if (emptyParams.length > 0) {
            setMessage({ type: 'error', text: 'All parameter names must be filled.' });
            return;
        }

        setIsSaving(true);
        saveMutation.mutate(parameters);
    };

    if (isLoading) {
        return (
            <div className="p-12 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-3">
                        <div className="p-2 bg-slate-900 text-white rounded-xl shadow-lg shadow-slate-900/10">
                            <Settings className="w-6 h-6" />
                        </div>
                        Global Schema Mapping
                    </h1>
                    <p className="text-slate-500 mt-1 font-medium">Define mandatory parameters for all global extractions.</p>
                </div>

                <div className="flex items-center gap-3">
                    {message && (
                        <div className={clsx(
                            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all animate-in fade-in slide-in-from-top-2",
                            message.type === 'success' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"
                        )}>
                            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {message.text}
                        </div>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-slate-800 disabled:opacity-50 transition-all shadow-lg shadow-slate-900/10"
                    >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-900/5 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Info className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-900 text-sm italic">Master Variable List</h2>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Define your schema below</p>
                        </div>
                    </div>

                    <button
                        onClick={addParameter}
                        className="flex items-center gap-2 text-slate-900 bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-black hover:bg-slate-50 transition-all shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        New Variable
                    </button>
                </div>

                <div className="p-8">
                    {parameters.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                                <Settings className="w-8 h-8 text-slate-200" />
                            </div>
                            <h3 className="text-slate-900 font-bold">No parameters defined</h3>
                            <p className="text-slate-500 text-sm mt-1 max-w-xs">Define global parameters to enable AI extraction for master data.</p>
                            <button
                                onClick={addParameter}
                                className="mt-6 text-slate-900 bg-white border border-slate-200 px-6 py-3 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Add First Parameter
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-12 gap-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                <div className="col-span-1 flex items-center">#</div>
                                <div className="col-span-6">Variable Name</div>
                                <div className="col-span-3">Data Type</div>
                                <div className="col-span-2 text-right">Actions</div>
                            </div>

                            {parameters.map((param, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-4 items-center bg-slate-50/30 p-4 rounded-2xl border border-transparent hover:border-slate-200 hover:bg-white transition-all group">
                                    <div className="col-span-1 text-xs font-bold text-slate-400">
                                        {idx + 1}
                                    </div>

                                    <div className="col-span-6 relative">
                                        <input
                                            type="text"
                                            value={param.name}
                                            onChange={(e) => updateParameter(idx, 'name', e.target.value)}
                                            placeholder="e.g. Full Name, Phone, Date of Birth"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-slate-900 transition-all outline-none"
                                        />
                                    </div>

                                    <div className="col-span-3">
                                        <div className="relative">
                                            <select
                                                value={param.type}
                                                onChange={(e) => updateParameter(idx, 'type', e.target.value as any)}
                                                className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold appearance-none focus:ring-2 focus:ring-slate-900 transition-all outline-none"
                                            >
                                                <option value="text">Text</option>
                                                <option value="number">Number</option>
                                                <option value="date">Date</option>
                                            </select>
                                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                                                {param.type === 'text' && <Type className="w-4 h-4" />}
                                                {param.type === 'number' && <Hash className="w-4 h-4" />}
                                                {param.type === 'date' && <Calendar className="w-4 h-4" />}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="col-span-2 text-right">
                                        <button
                                            onClick={() => removeParameter(idx)}
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-slate-500" />
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                        These parameters are applied system-wide for all super-admin uploads. Ensure they match your Master Sheet targets.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default GlobalSettingsPage;

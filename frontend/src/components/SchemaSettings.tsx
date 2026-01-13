import React, { useState } from 'react';
import { Hash, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

interface RegistryParameter {
    name: string;
    type: string;
    mapping: string;
}

interface Registry {
    name: string;
    parameters: RegistryParameter[];
}

interface SchemaSettingsProps {
    registry: Registry;
    bucketId: string;
    onBack: () => void;
}

const SchemaSettings = ({ registry, bucketId, onBack }: SchemaSettingsProps) => {
    const queryClient = useQueryClient();
    const [newParameter, setNewParameter] = useState({ name: '', type: 'text', mapping: '' });

    const updateSettingsMutation = useMutation({
        mutationFn: (parameters: any[]) => api.put(`/buckets/${bucketId}/settings`, { parameters }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registry', bucketId] });
        },
        onError: (err: any) => {
            window.alert('Failed to update settings');
        }
    });

    const addParameter = () => {
        if (!newParameter.name) return;
        const currentParams = registry?.parameters || [];
        updateSettingsMutation.mutate([...currentParams, newParameter]);
        setNewParameter({ name: '', type: 'text', mapping: '' });
    };

    const removeParameter = (index: number) => {
        const currentParams = registry?.parameters || [];
        const updatedParams = currentParams.filter((_, i) => i !== index);
        updateSettingsMutation.mutate(updatedParams);
    };

    return (
        <div className="h-full bg-white rounded-[32px] shadow-[0px_4px_30px_rgba(0,0,0,0.03)] border border-slate-50 flex flex-col overflow-hidden animate-in fade-in">
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-20">
                <div>
                    <h3 className="text-lg font-bold text-[#2D384A]">Schema Configuration</h3>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">Map your data fields</p>
                </div>
                <button onClick={onBack} className="px-4 py-2 bg-[#F8F9FA] rounded-xl text-xs font-bold text-[#2D384A] hover:bg-slate-200">
                    Done
                </button>
            </div>

            <div className="p-8 h-full overflow-auto custom-scrollbar">
                <div className="max-w-2xl mx-auto space-y-4">
                    {registry?.parameters?.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 shadow-sm">
                                    <Hash size={18} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[#2D384A]">{p.name}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{p.type}</p>
                                </div>
                            </div>
                            <button onClick={() => removeParameter(i)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                        </div>
                    ))}

                    {/* Add New Parameter Widget */}
                    <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl hover:border-[#A8328D] transition-colors group">
                        <div className="flex gap-2">
                            <input
                                className="flex-1 bg-transparent text-sm font-bold text-[#2D384A] placeholder:text-slate-300 outline-none"
                                placeholder="New Field Name..."
                                value={newParameter.name}
                                onChange={e => setNewParameter({ ...newParameter, name: e.target.value })}
                            />
                            <button onClick={addParameter} disabled={!newParameter.name} className="px-4 py-2 bg-[#2D384A] text-white rounded-lg text-xs font-bold uppercase tracking-widest group-hover:bg-[#A8328D] transition-colors disabled:opacity-50">
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SchemaSettings;

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    ArrowRight,
    CheckCircle2,
    Layers,
    AlertCircle,
    Database,
    Settings2,
    ChevronLeft
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import clsx from 'clsx';

interface ConsolidationWizardProps {
    sourceBucket: any;
    targetBucket: any;
    onClose: () => void;
    onComplete: (newBucketId: string) => void;
}

const ConsolidationWizard = ({ sourceBucket, targetBucket, onClose, onComplete }: ConsolidationWizardProps) => {
    const [step, setStep] = useState(1);
    const [mergeName, setMergeName] = useState(`Combined: ${sourceBucket.name} & ${targetBucket.name}`);
    const queryClient = useQueryClient();

    const { data: analysis, isLoading: analyzing } = useQuery({
        queryKey: ['merge-analysis', sourceBucket._id, targetBucket._id],
        queryFn: async () => {
            const res = await api.post('/merge/analyze', { sourceId: sourceBucket._id, targetId: targetBucket._id });
            return res.data;
        },
        enabled: step >= 2
    });

    const mergeMutation = useMutation({
        mutationFn: (data: any) => api.post('/merge/execute', data),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['registries'] });
            onComplete(res.data.bucketId);
        }
    });

    const handleExecuteMerge = () => {
        mergeMutation.mutate({
            sourceId: sourceBucket._id,
            targetId: targetBucket._id,
            mergeName,
            conflictResolution: 'fuse'
        });
    };

    return (
        <div className="fixed inset-0 z-[300] bg-[#2D384A]/60 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-[#EEEEEF] w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-white/20"
            >
                {/* Header */}
                <div className="px-8 py-6 bg-white border-b border-[#2D384A]/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[#A8328D]/10 rounded-xl flex items-center justify-center">
                            <Layers className="w-5 h-5 text-[#A8328D]" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-[#2D384A] tracking-tight">Merge Protocol</h2>
                            <p className="text-[10px] font-bold text-[#2D384A]/40 uppercase tracking-[0.15em]">System Consolidation v2.4</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-[#2D384A]/5 rounded-lg text-[#2D384A]/40 hover:text-red-500 transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Stepper Progress */}
                <div className="flex w-full h-1.5 bg-[#2D384A]/5">
                    {[1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className={clsx(
                                "flex-1 transition-all duration-500",
                                step >= i ? "bg-[#A8328D]" : "bg-transparent"
                            )}
                        />
                    ))}
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white/50">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="space-y-6"
                            >
                                <div className="p-6 bg-white rounded-2xl border border-[#2D384A]/5 shadow-sm">
                                    <h3 className="text-sm font-bold text-[#2D384A] mb-4 flex items-center gap-2">
                                        <Settings2 className="w-4 h-4 text-[#A8328D]" />
                                        Identity Attribution
                                    </h3>
                                    <p className="text-xs text-[#2D384A]/60 font-medium mb-6 leading-relaxed">
                                        You are merging <span className="text-[#2D384A] font-bold">{sourceBucket.name}</span> into <span className="text-[#2D384A] font-bold">{targetBucket.name}</span>.
                                        Please define the name for the resulting unified node.
                                    </p>

                                    <div className="space-y-2">
                                        <label className="text-[9px] font-bold text-[#2D384A]/40 uppercase tracking-widest ml-1">New Node Name</label>
                                        <input
                                            value={mergeName}
                                            onChange={e => setMergeName(e.target.value)}
                                            className="w-full px-5 py-4 bg-[#EEEEEF]/50 border border-[#2D384A]/10 rounded-xl text-md font-bold text-[#2D384A] focus:ring-2 focus:ring-[#A8328D]/20 transition-all outline-none"
                                            placeholder="Unified Node Name..."
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="space-y-6"
                            >
                                <h3 className="text-sm font-bold text-[#2D384A] flex items-center gap-2">
                                    <Database className="w-4 h-4 text-[#A8328D]" />
                                    Deep Scan Analysis
                                </h3>

                                {analyzing ? (
                                    <div className="py-16 flex flex-col items-center justify-center space-y-4 bg-white rounded-2xl border border-[#2D384A]/5">
                                        <div className="w-8 h-8 border-3 border-[#A8328D]/10 border-t-[#A8328D] rounded-full animate-spin" />
                                        <p className="text-[10px] font-bold text-[#2D384A]/40 uppercase tracking-widest animate-pulse">Analyzing Schemas...</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-4">
                                        <StatsCard label="Identical" value={analysis?.identical} icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />} />
                                        <StatsCard label="Conflicts" value={analysis?.conflicts} icon={<AlertCircle className="w-5 h-5 text-amber-500" />} type="warning" />
                                        <StatsCard label="Source Only" value={analysis?.uniqueA} />
                                        <StatsCard label="Target Only" value={analysis?.uniqueB} />
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="space-y-6"
                            >
                                <div className="p-6 bg-white rounded-2xl border border-[#2D384A]/5 shadow-sm">
                                    <h3 className="text-sm font-bold text-[#2D384A] mb-4 flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 text-amber-500" />
                                        Conflict Resolution Lab
                                    </h3>
                                    <p className="text-xs text-[#2D384A]/60 font-medium mb-6">
                                        Found <span className="font-bold text-[#2D384A]">{analysis?.conflicts}</span> intersections. Select your merge strategy:
                                    </p>

                                    <div className="space-y-3">
                                        <ResolutionOption
                                            active
                                            title="Smart Fusion"
                                            desc="Intelligently combine field-level data to create the most complete record."
                                        />
                                        <ResolutionOption
                                            title="Preserve Disparity"
                                            desc="Treat similar records as unique entries to avoid any data loss."
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 4 && (
                            <motion.div
                                key="step4"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-center py-8"
                            >
                                <div className="w-20 h-20 bg-[#A8328D]/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                    <CheckCircle2 className="w-10 h-10 text-[#A8328D]" />
                                </div>
                                <h3 className="text-xl font-bold text-[#2D384A] mb-2">Ready to Fusing Nodes</h3>
                                <p className="text-xs text-[#2D384A]/60 max-w-xs mx-auto font-medium leading-relaxed">
                                    All parameters are set. Source data will be archived into the new lineage for future restoration capability.
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer Controls */}
                <div className="px-8 py-6 bg-white border-t border-[#2D384A]/5 flex items-center justify-between">
                    <button
                        onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
                        className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-[#2D384A]/40 hover:text-[#2D384A] transition-all uppercase tracking-widest"
                    >
                        {step > 1 && <ChevronLeft className="w-3 h-3" />}
                        {step === 1 ? 'Cancel Protocol' : 'Previous Step'}
                    </button>

                    <button
                        onClick={() => {
                            if (step < 4) setStep(s => s + 1);
                            else handleExecuteMerge();
                        }}
                        disabled={mergeMutation.isPending}
                        className="px-8 py-3 bg-[#2D384A] text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#A8328D] transition-all flex items-center gap-3 shadow-lg shadow-[#2D384A]/10 disabled:opacity-50"
                    >
                        {mergeMutation.isPending ? 'Executing...' : step === 4 ? 'Confirm & Execute' : 'Next Phase'}
                        <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const StatsCard = ({ label, value, icon, type = 'default' }: any) => (
    <div className="p-5 rounded-2xl border border-[#2D384A]/5 bg-white flex items-center gap-4 shadow-sm">
        <div className={clsx(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            type === 'warning' ? 'bg-amber-50' : 'bg-[#EEEEEF]'
        )}>
            {icon || <Database className="w-5 h-5 text-[#2D384A]/40" />}
        </div>
        <div>
            <p className="text-[9px] font-bold text-[#2D384A]/40 uppercase tracking-widest">{label}</p>
            <p className="text-lg font-bold text-[#2D384A] tracking-tight">{value?.toLocaleString() || 0}</p>
        </div>
    </div>
);

const ResolutionOption = ({ title, desc, active = false }: any) => (
    <div className={clsx(
        "p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-4",
        active ? 'bg-white border-[#A8328D] shadow-md' : 'bg-transparent border-[#2D384A]/5 hover:border-[#2D384A]/20'
    )}>
        <div className={clsx(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
            active ? 'border-[#A8328D] bg-[#A8328D]' : 'border-[#2D384A]/20'
        )}>
            {active && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
        </div>
        <div>
            <p className="text-xs font-bold text-[#2D384A]">{title}</p>
            <p className="text-[10px] text-[#2D384A]/50 font-medium">{desc}</p>
        </div>
    </div>
);

export default ConsolidationWizard;
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    ArrowRight,
    CheckCircle2,
    Layers,
    AlertCircle,
    Database,
    Settings2
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

    // Analysis Query
    const { data: analysis, isLoading: analyzing } = useQuery({
        queryKey: ['merge-analysis', sourceBucket._id, targetBucket._id],
        queryFn: async () => {
            const res = await api.post('/merge/analyze', { sourceId: sourceBucket._id, targetId: targetBucket._id });
            return res.data;
        },
        enabled: step >= 2
    });

    // Merge Mutation
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
            conflictResolution: 'fuse' // Default for now
        });
    };

    return (
        <div className="fixed inset-0 z-[300] bg-[#2D384A]/40 backdrop-blur-xl flex items-center justify-center p-6 sm:p-12">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-full border border-white"
            >
                {/* Wizard Header */}
                <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <div className="flex items-center gap-3 text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-2">
                            <Layers className="w-4 h-4" />
                            <span>System Consolidation Protocol</span>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Merging Data Nodes</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 bg-white rounded-2xl text-slate-400 hover:text-red-500 hover:shadow-lg transition-all"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="flex h-1 bg-slate-100">
                    <motion.div
                        animate={{ width: `${(step / 4) * 100}%` }}
                        className="bg-indigo-600 h-full"
                    />
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="p-8 bg-indigo-50/50 rounded-[32px] border border-indigo-100/50">
                                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-3">
                                        <Settings2 className="w-5 h-5 text-indigo-500" />
                                        Step 1: Alignment & Attribution
                                    </h3>
                                    <p className="text-sm text-slate-500 font-medium mb-8 leading-relaxed">
                                        We are preparing to fuse <b>{sourceBucket.name}</b> into <b>{targetBucket.name}</b>.
                                        All source records will inherit the schema and attributes of the target node.
                                    </p>

                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Merged Node Identity</label>
                                        <input
                                            value={mergeName}
                                            onChange={e => setMergeName(e.target.value)}
                                            className="w-full px-8 py-5 bg-white border border-slate-200 rounded-[24px] text-lg font-bold text-slate-900 focus:ring-4 focus:ring-indigo-500/5 transition-all outline-none"
                                            placeholder="Enter merged bucket name..."
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="space-y-6">
                                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-3">
                                        <Database className="w-5 h-5 text-indigo-500" />
                                        Step 2: Deep Scan Analysis
                                    </h3>

                                    {analyzing ? (
                                        <div className="py-20 flex flex-col items-center justify-center space-y-4">
                                            <div className="w-12 h-12 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin" />
                                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Running Consolidation Logic...</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-6">
                                            <StatsCard label="Identical Records" value={analysis?.identical} icon={<CheckCircle2 className="w-6 h-6 text-emerald-500" />} />
                                            <StatsCard label="Potential Conflicts" value={analysis?.conflicts} icon={<AlertCircle className="w-6 h-6 text-amber-500" />} color="amber" />
                                            <StatsCard label="Unique to Node A" value={analysis?.uniqueA} />
                                            <StatsCard label="Unique to Node B" value={analysis?.uniqueB} />
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="p-8 bg-amber-50/50 rounded-[32px] border border-amber-100/50">
                                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-3">
                                        <AlertCircle className="w-5 h-5 text-amber-500" />
                                        Step 3: Conflict Lab
                                    </h3>
                                    <p className="text-sm text-slate-500 font-medium mb-6">
                                        Found <b>{analysis?.conflicts}</b> records with similar names but different data.
                                    </p>

                                    <div className="space-y-4">
                                        <ResolutionOption
                                            active
                                            title="Smart Fusion (Recommended)"
                                            desc="Intelligently merge fields in A and B to create the most complete record version."
                                        />
                                        <ResolutionOption
                                            title="Keep Both (Duplicate)"
                                            desc="Treat similar records as different individuals and keep both versions."
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 4 && (
                            <motion.div
                                key="step4"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="text-center py-10"
                            >
                                <div className="w-24 h-24 bg-indigo-50 rounded-[40px] flex items-center justify-center mx-auto mb-8">
                                    <Layers className="w-10 h-10 text-indigo-600" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 mb-4">Ready to Commit</h3>
                                <p className="text-sm text-slate-500 max-w-sm mx-auto font-medium leading-relaxed">
                                    Node consolidation will initialize. Parent data will be preserved in lineage for perfect unmerging later.
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer Controls */}
                <div className="px-10 py-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <button
                        onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
                        className="px-8 py-4 text-xs font-black text-slate-400 hover:text-slate-900 transition-all uppercase tracking-widest"
                    >
                        {step === 1 ? 'Discard Merge' : 'Back'}
                    </button>

                    <button
                        onClick={() => {
                            if (step < 4) setStep(s => s + 1);
                            else handleExecuteMerge();
                        }}
                        disabled={mergeMutation.isPending}
                        className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shadow-xl shadow-slate-900/10"
                    >
                        {mergeMutation.isPending ? 'Processing...' : step === 4 ? 'Confirm & Execute' : 'Continue'}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const StatsCard = ({ label, value, icon, color = 'indigo' }: any) => (
    <div className={clsx(
        "p-6 rounded-[28px] border bg-white flex items-center gap-5 transition-all shadow-sm",
        color === 'amber' ? 'border-amber-100 hover:shadow-lg hover:shadow-amber-500/5' : 'border-slate-50 hover:shadow-lg hover:shadow-indigo-500/5'
    )}>
        <div className={clsx(
            "w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner",
            color === 'amber' ? 'bg-amber-50' : 'bg-indigo-50'
        )}>
            {icon || <Database className="w-6 h-6 text-indigo-500" />}
        </div>
        <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-2xl font-black text-slate-900 tracking-tight">{value?.toLocaleString() || 0}</p>
        </div>
    </div>
);

const ResolutionOption = ({ title, desc, active = false }: any) => (
    <div className={clsx(
        "p-5 rounded-3xl border-2 transition-all cursor-pointer flex items-center gap-4",
        active ? 'bg-white border-indigo-600 shadow-xl shadow-indigo-500/5' : 'bg-white/50 border-transparent hover:border-indigo-200'
    )}>
        <div className={clsx(
            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
            active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200'
        )}>
            {active && <div className="w-2 h-2 bg-white rounded-full" />}
        </div>
        <div>
            <p className="text-sm font-bold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500 font-medium">{desc}</p>
        </div>
    </div>
);

export default ConsolidationWizard;

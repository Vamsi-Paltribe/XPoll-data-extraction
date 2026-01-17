import { FC } from 'react';
import { X, GitMerge, Check, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils';
import { useBuckets } from '../hooks';
import { useConsolidationWizard } from '../hooks/useConsolidationWizard';

interface ConsolidationWizardProps {
    onClose: () => void;
    onCompleted: (newBucketId: string) => void;
    initialSource?: any;
    initialTarget?: any;
}

const StatsCard = ({ label, value, subValue, icon: Icon, color }: any) => (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
            <Icon size={20} />
        </div>
        <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
            <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-[#2D384A]">{value}</span>
                {subValue && <span className="text-[10px] text-slate-400">{subValue}</span>}
            </div>
        </div>
    </div>
);

const ResolutionOption = ({ title, desc, active, onClick }: any) => (
    <div
        onClick={onClick}
        className={cn(
            "p-5 rounded-2xl border-2 transition-all cursor-pointer group",
            active ? "border-[#A8328D] bg-[#A8328D]/5" : "border-slate-100 bg-white hover:border-slate-200"
        )}
    >
        <div className="flex justify-between items-start mb-2">
            <h4 className={cn("font-bold text-sm", active ? "text-[#A8328D]" : "text-[#2D384A]")}>{title}</h4>
            <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                active ? "border-[#A8328D] bg-[#A8328D]" : "border-slate-200"
            )}>
                {active && <Check size={12} className="text-white" />}
            </div>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
    </div>
);

const Step1Selection = ({ sourceId, setSourceId, targetId, setTargetId, buckets }: any) => (
    <div className="space-y-8 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-slate-100 rounded-full z-10 hidden md:flex items-center justify-center text-slate-400">
                <ArrowRight size={20} />
            </div>

            <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Source Registry</label>
                <select
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    className="w-full h-14 px-5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-[#A8328D]/20 outline-none transition-all"
                >
                    <option value="">Select source...</option>
                    {buckets?.map((b: any) => (
                        <option key={b._id} value={b._id}>{b.name} ({b.recordCount} rcs)</option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400">This data will be merged into the target.</p>
            </div>

            <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Target Registry</label>
                <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full h-14 px-5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-[#A8328D]/20 outline-none transition-all"
                >
                    <option value="">Select target...</option>
                    {buckets?.map((b: any) => (
                        <option key={b._id} value={b._id}>{b.name} ({b.recordCount} rcs)</option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400">This registry will host the combined records.</p>
            </div>
        </div>
    </div>
);

const Step2Analysis = ({ analysis, analyzing, error }: any) => {
    if (analyzing) return (
        <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 border-4 border-slate-100 border-t-[#A8328D] rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Scanning for Conflicts...</p>
        </div>
    );

    if (error) return (
        <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
                <AlertCircle size={32} />
            </div>
            <div>
                <h4 className="font-bold text-[#2D384A]">Analysis Failed</h4>
                <p className="text-xs text-slate-400 mt-1">We couldn't analyze these registries. They might have incompatible schemas.</p>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatsCard
                    label="Combined Records"
                    value={analysis?.totalExpected}
                    icon={GitMerge}
                    color="bg-indigo-50 text-indigo-600"
                />
                <StatsCard
                    label="Potential Matches"
                    value={analysis?.conflicts}
                    subValue="identities"
                    icon={Check}
                    color="bg-emerald-50 text-emerald-600"
                />
                <StatsCard
                    label="Schema Match"
                    value={`${analysis?.schemaMatch}%`}
                    icon={AlertCircle}
                    color="bg-amber-50 text-amber-600"
                />
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="text-xs font-bold text-[#2D384A] uppercase tracking-widest mb-4">Consolidation Summary</h4>
                <ul className="space-y-3">
                    <li className="flex items-start gap-3 text-xs text-slate-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#A8328D] mt-1.5 shrink-0" />
                        <span>Source registry data will be deduplicated against the target based on shared identity fields.</span>
                    </li>
                    <li className="flex items-start gap-3 text-xs text-slate-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#A8328D] mt-1.5 shrink-0" />
                        <span>Fields present in the source but missing in the target will be appended to the target schema.</span>
                    </li>
                </ul>
            </div>
        </div>
    );
};

const Step3Resolution = ({ strategy, setStrategy }: any) => (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ResolutionOption
                title="Favor Target"
                desc="If duplicate records are found, data in the target registry will take precedence. Missing fields from source will still be added."
                active={strategy === 'keep_target'}
                onClick={() => setStrategy('keep_target')}
            />
            <ResolutionOption
                title="Favor Source"
                desc="Data from the incoming source registry will overwrite existing records in the target if identity matches are found."
                active={strategy === 'keep_source'}
                onClick={() => setStrategy('keep_source')}
            />
        </div>

        <div className="flex items-center gap-3 p-4 bg-blue-50 text-blue-700 rounded-xl">
            <AlertCircle size={18} />
            <p className="text-[10px] font-medium italic">Safety Note: A backup of the target registry will be created automatically before this operation.</p>
        </div>
    </div>
);

const ConsolidationWizard: FC<ConsolidationWizardProps> = (props) => {
    const { buckets } = useBuckets();
    const {
        step,
        sourceId,
        setSourceId,
        targetId,
        setTargetId,
        strategy,
        setStrategy,
        analysis,
        analyzing,
        analysisError,
        isExecuting,
        handleNext,
        handleBack,
        handleExecute,
        onClose
    } = useConsolidationWizard(props);

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-[#2D384A]/60 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white w-full max-w-3xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col"
            >
                {/* Header */}
                <div className="px-10 pt-10 pb-6 flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#A8328D]/10 text-[#A8328D] rounded-2xl flex items-center justify-center">
                            <GitMerge size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-[#2D384A]">Consolidation Wizard</h2>
                            <p className="text-xs text-slate-400 mt-0.5">Step {step}: {step === 1 ? 'Selection' : step === 2 ? 'Analysis' : 'Resolution'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-slate-50 rounded-2xl transition-colors"><X size={24} className="text-slate-300" /></button>
                </div>

                {/* Content */}
                <div className="px-10 py-6 flex-1 overflow-y-auto min-h-[400px]">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={step}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {step === 1 && (
                                <Step1Selection
                                    sourceId={sourceId} setSourceId={setSourceId}
                                    targetId={targetId} setTargetId={setTargetId}
                                    buckets={buckets}
                                />
                            )}
                            {step === 2 && (
                                <Step2Analysis analysis={analysis} analyzing={analyzing} error={analysisError} />
                            )}
                            {step === 3 && (
                                <Step3Resolution strategy={strategy} setStrategy={setStrategy} />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="px-10 py-8 bg-slate-50 flex justify-between items-center">
                    <button
                        onClick={handleBack}
                        disabled={step === 1}
                        className="px-6 py-3 text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-2 disabled:opacity-0"
                    >
                        <ArrowLeft size={16} /> Back
                    </button>

                    {step < 3 ? (
                        <button
                            onClick={handleNext}
                            className="px-8 py-3.5 bg-[#2D384A] text-white rounded-2xl text-xs font-bold flex items-center gap-3 hover:bg-[#A8328D] transition-all"
                        >
                            Continue <ArrowRight size={16} />
                        </button>
                    ) : (
                        <button
                            onClick={handleExecute}
                            disabled={isExecuting}
                            className="px-8 py-3.5 bg-[#A8328D] text-white rounded-2xl text-xs font-bold flex items-center gap-3 hover:bg-[#8e2a77] transition-all shadow-lg shadow-[#A8328D]/30"
                        >
                            {isExecuting ? 'Processing...' : 'Merge Registries'} <GitMerge size={16} />
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default ConsolidationWizard;
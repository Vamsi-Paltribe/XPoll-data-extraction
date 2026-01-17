import { useState } from 'react';
import { useMergeAnalysis, useExecuteMerge } from './useMerge';
import { toast } from 'sonner';

interface ConsolidationWizardProps {
    onClose: () => void;
    onCompleted: (newBucketId: string) => void;
    initialSource?: any;
    initialTarget?: any;
}

export const useConsolidationWizard = ({ onClose, onCompleted, initialSource, initialTarget }: ConsolidationWizardProps) => {
    const [step, setStep] = useState(1);
    const [sourceId, setSourceId] = useState<string>(initialSource?._id || '');
    const [targetId, setTargetId] = useState<string>(initialTarget?._id || '');
    const [strategy, setStrategy] = useState<'keep_target' | 'keep_source' | 'manual'>('keep_target');

    const { data: analysis, isPending: analyzing, error: analysisError } = useMergeAnalysis(
        sourceId,
        targetId,
        step === 2 && !!sourceId && !!targetId
    );

    const executeMerge = useExecuteMerge((newId) => {
        toast.success("Consolidation Successful");
        onCompleted(newId);
    });

    const handleNext = () => {
        if (step === 1) {
            if (!sourceId || !targetId) {
                toast.error("Please select both source and target registries");
                return;
            }
            if (sourceId === targetId) {
                toast.error("Cannot merge a registry with itself");
                return;
            }
            setStep(2);
        } else if (step === 2) {
            setStep(3);
        }
    };

    const handleBack = () => {
        if (step > 1) setStep(step - 1);
    };

    const handleExecute = () => {
        executeMerge.mutate({
            sourceId,
            targetId,
            strategy,
            // In a real scenario, manual overrides would be passed here
        });
    };

    return {
        step,
        setStep,
        sourceId,
        setSourceId,
        targetId,
        setTargetId,
        strategy,
        setStrategy,
        analysis,
        analyzing,
        analysisError,
        isExecuting: executeMerge.isPending,
        handleNext,
        handleBack,
        handleExecute,
        onClose
    };
};

import { UploadCloud } from 'lucide-react';

interface RegistryDragOverlayProps {
    onDragLeave: () => void;
}

export const RegistryDragOverlay = ({ onDragLeave }: RegistryDragOverlayProps) => {
    return (
        <div
            className="fixed inset-0 z-50 bg-[#2D384A]/60 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300 pointer-events-none"
            onDragLeave={onDragLeave}
        >
            <div className="w-24 h-24 bg-white rounded-[32px] flex items-center justify-center text-slate-900 shadow-2xl mb-6 animate-bounce">
                <UploadCloud size={48} />
            </div>
            <h3 className="text-3xl font-black text-white tracking-tight text-center">Drop to Ingest Data</h3>
            <p className="text-white/60 text-sm font-bold uppercase tracking-[0.2em] mt-2">Protocol: Automated Schema Matching</p>
        </div>
    );
};

import { UploadCloud } from 'lucide-react';

interface WorkspaceDragOverlayProps {
    onDragLeave: () => void;
}

export const WorkspaceDragOverlay = ({ onDragLeave }: WorkspaceDragOverlayProps) => (
    <div
        onDragLeave={onDragLeave}
        className="fixed inset-0 z-[200] bg-[#2D384A]/90 backdrop-blur-sm flex items-center justify-center animate-in fade-in"
    >
        <div className="text-center pointer-events-none">
            <div className="w-24 h-24 bg-white/10 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-bounce">
                <UploadCloud className="text-white w-10 h-10" />
            </div>
            <h2 className="text-3xl font-extrabold text-white mb-2">Drop to Analyze</h2>
            <p className="text-slate-400 font-medium">Agent will process this file against the schema.</p>
        </div>
    </div>
);

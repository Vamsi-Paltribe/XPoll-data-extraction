import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Clock, Download } from 'lucide-react';

interface WorkspaceHeaderProps {
    name: string;
    totalRecords: number;
    onSyncClick: () => void;
}

export const WorkspaceHeader = ({ name, totalRecords, onSyncClick }: WorkspaceHeaderProps) => {
    const navigate = useNavigate();

    return (
        <header className="px-8 py-5 flex items-center justify-between sticky top-0 z-20 backdrop-blur-sm rounded-2xl bg-white">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/')}
                    className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center text-slate-500 transition-all shadow-sm"
                >
                    <ArrowLeft size={18} strokeWidth={2.5} />
                </button>
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                        <span>Buckets</span>
                        <ChevronRight size={10} />
                        <span className="text-[#A8328D]">Workspace</span>
                    </div>
                    <h1 className="text-xl font-extrabold text-[#2D384A] tracking-tight">{name || 'Loading...'}</h1>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-100">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Records</span>
                    <span className="text-sm font-bold text-[#2D384A]">{totalRecords.toLocaleString()}</span>
                </div>
                <button
                    onClick={onSyncClick}
                    className="bg-white text-[#2D384A] px-5 py-2.5 rounded-[16px] text-xs font-bold uppercase tracking-wider hover:shadow-lg transition-all flex items-center gap-2 border border-slate-200"
                >
                    <Clock size={16} className="text-[#F7A25A]" /> Download Data
                </button>
                <button className="bg-[#2D384A] text-white px-5 py-2.5 rounded-[16px] text-xs font-bold uppercase tracking-wider hover:shadow-lg hover:shadow-[#2D384A]/20 transition-all flex items-center gap-2">
                    <Download size={16} /> Export
                </button>
            </div>
        </header>
    );
};

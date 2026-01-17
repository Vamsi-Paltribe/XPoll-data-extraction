import { cn } from '@/utils';

interface UnmergeOptionProps {
    active: boolean;
    title: string;
    desc: string;
    onClick: () => void;
}

export const UnmergeOption = ({ active, title, desc, onClick }: UnmergeOptionProps) => (
    <button
        onClick={onClick}
        className={cn(
            "w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-4",
            active ? "bg-white border-[#A8328D] shadow-lg shadow-[#A8328D]/5" : "bg-white/50 border-transparent hover:border-[#2D384A]/10"
        )}
    >
        <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all", active ? "border-[#A8328D]" : "border-slate-300")}>
            {active && <div className="w-2.5 h-2.5 bg-[#A8328D] rounded-full" />}
        </div>
        <div>
            <p className="text-xs font-black text-[#2D384A] uppercase tracking-wide">{title}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">{desc}</p>
        </div>
    </button>
);

import { cn } from '../../../utils';

interface ResolutionOptionProps {
    title: string;
    desc: string;
    active?: boolean;
}

export const ResolutionOption = ({ title, desc, active = false }: ResolutionOptionProps) => (
    <div className={cn(
        "p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-4",
        active ? 'bg-white border-[#A8328D] shadow-md' : 'bg-transparent border-[#2D384A]/5 hover:border-[#2D384A]/20'
    )}>
        <div className={cn(
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

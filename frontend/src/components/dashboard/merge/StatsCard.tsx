import { Database } from 'lucide-react';
import clsx from 'clsx';

interface StatsCardProps {
    label: string;
    value: number | undefined;
    icon?: React.ReactNode;
    type?: 'default' | 'warning';
}

export const StatsCard = ({ label, value, icon, type = 'default' }: StatsCardProps) => (
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

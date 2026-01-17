import { useState, useEffect, useRef, FC } from 'react';
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from '../utils';

const US_STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
    "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
    "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
    "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
    "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
];

interface StateSelectorProps {
    value: string;
    onChange: (value: string) => void;
    className?: string; // Allow custom styling
}

const StateSelector: FC<StateSelectorProps> = ({ value, onChange, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Filter states
    const filteredStates = US_STATES.filter(state =>
        state.toLowerCase().includes(search.toLowerCase())
    );

    // Dropdown visibility & focus management
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            inputRef.current?.focus();
        } else {
            setSearch(""); // Reset search on close
            document.removeEventListener('mousedown', handleClickOutside);
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <div className={cn("relative", className)} ref={dropdownRef}>
            {/* Toggle Button */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex h-11 w-full items-center justify-between rounded-xl border bg-white px-3 py-2 text-sm font-bold cursor-pointer transition-all hover:bg-slate-50",
                    isOpen ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200',
                    !value ? 'text-slate-500' : 'text-slate-900'
                )}
            >
                {value || <span className="font-normal opacity-50">Select state...</span>}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-[9999] bottom-[calc(100%+4px)] left-0 w-full min-w-[200px] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col">

                    {/* Search Input */}
                    <div className="flex items-center px-3 py-2 border-b border-slate-100 bg-slate-50/50">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <input
                            ref={inputRef}
                            className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Search state..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <button onClick={() => setSearch("")} className="ml-2 hover:bg-slate-200 rounded-full p-0.5">
                                <X className="h-4 w-4 opacity-50" />
                            </button>
                        )}
                    </div>

                    {/* Options List */}
                    <div className="max-h-[200px] overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-slate-200">
                        {filteredStates.length === 0 ? (
                            <div className="py-6 text-center text-sm text-slate-500">No state found.</div>
                        ) : (
                            filteredStates.map((state) => (
                                <div
                                    key={state}
                                    onClick={() => {
                                        onChange(state === value ? "" : state);
                                        setIsOpen(false);
                                    }}
                                    className={cn(
                                        "relative flex cursor-default select-none items-center rounded-lg px-2 py-2 text-sm outline-none transition-colors hover:bg-slate-100 cursor-pointer",
                                        value === state ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700'
                                    )}
                                >
                                    <Check
                                        className={cn("mr-2 h-4 w-4 transition-opacity", value === state ? "opacity-100" : "opacity-0")}
                                    />
                                    {state}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StateSelector;

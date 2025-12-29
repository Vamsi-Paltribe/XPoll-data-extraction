import { useState, useEffect } from 'react';
import api from '../services/api';
import { useParams } from 'react-router-dom';
import clsx from 'clsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    X, Globe, Search, Database, Layers, Check,
    ChevronRight, Zap, MapPin, Filter
} from 'lucide-react';

const SyncModal = ({ isOpen, onClose, onSync, isSyncing }) => {
    const { id: bucketId } = useParams();
    const [selectedStates, setSelectedStates] = useState([]);
    const [selectedCities, setSelectedCities] = useState([]);
    const [selectedHeaders, setSelectedHeaders] = useState([]);

    // Dynamic Data Fetching
    const { data: directory, isLoading: loadingDirectory } = useQuery({
        queryKey: ['global-directory'],
        queryFn: async () => {
            const res = await api.get('/buckets/global/directory');
            return res.data;
        },
        enabled: isOpen,
        staleTime: 5 * 60 * 1000 // Cache for 5 mins
    });

    const stateOptions = directory?.states || [];
    const cityOptions = directory?.cities || [];

    const { data: availableHeaders = [], mutate: fetchHeaders } = useMutation({
        mutationFn: async () => {
            // We can actually use the directory endpoint for headers too if we optimized it, 
            // but let's stick to the specific header endpoint for now as it's separate logic
            const res = await api.post(`/buckets/${bucketId}/headers`, {
                filters: { states: [], cities: [] }
            });
            return res.data;
        },
        onSuccess: (data) => {
            setSelectedHeaders(data);
        }
    });

    useEffect(() => {
        if (isOpen) {
            fetchHeaders();
        }
    }, [isOpen, fetchHeaders]);

    const toggleState = (code) => {
        setSelectedStates(prev =>
            prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code]
        );
    };

    const handleCityChange = (e) => {
        const value = e.target.value;
        if (value && !selectedCities.includes(value)) {
            setSelectedCities(prev => [...prev, value]);
        }
    };

    const removeCity = (city) => {
        setSelectedCities(prev => prev.filter(c => c !== city));
    };

    const toggleHeader = (header) => {
        setSelectedHeaders(prev =>
            prev.includes(header) ? prev.filter(h => h !== header) : [...prev, header]
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-md flex items-center justify-center z-50 p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl border border-slate-200 max-w-6xl w-full shadow-modal flex flex-col md:flex-row h-[85vh] overflow-hidden animate-in zoom-in-95 duration-300">

                {/* Left Sidebar */}
                <div className="w-full md:w-80 bg-slate-50 border-r border-slate-200 p-10 flex flex-col">
                    <div className="mb-12">
                        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white mb-6 shadow-lg shadow-slate-900/10">
                            <Zap className="w-5 h-5" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight leading-none mb-2">Sync Terminal</h2>
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Protocol V4.2 - X-POLL</p>
                    </div>

                    <div className="space-y-4 flex-1">
                        {[
                            { step: 1, label: 'Regional Scoping', icon: Globe, active: true, done: selectedStates.length > 0 },
                            { step: 2, label: 'City Targeting', icon: Search, active: selectedStates.length > 0, done: selectedCities.length > 0 },
                            { step: 3, label: 'Payload Schema', icon: Layers, active: true, done: selectedHeaders.length > 0 },
                        ].map((s) => (
                            <div key={s.step} className={clsx(
                                "group flex items-center gap-4 p-4 rounded-2xl transition-all",
                                s.active ? "" : "opacity-30 grayscale"
                            )}>
                                <div className={clsx(
                                    "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all",
                                    s.done ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-400"
                                )}>
                                    {s.done ? <Check className="w-4 h-4 stroke-[3px]" /> : s.step}
                                </div>
                                <span className="text-xs font-bold text-slate-700">{s.label}</span>
                            </div>
                        ))}
                    </div>

                    <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Stream Scale</span>
                        </div>
                        <p className="text-base font-bold text-slate-900 leading-tight mb-1">
                            {selectedStates.length ? `${selectedStates.length} Regions` : 'Broad Scan'}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400">{selectedHeaders.length} Fields Projected</p>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col pt-4">
                    <div className="flex items-center justify-between p-10 pb-6">
                        <div>
                            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Terminal Configuration</h3>
                            <p className="text-slate-400 text-sm mt-0.5">Define extraction boundaries and projection schema.</p>
                        </div>
                        <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-900 rounded-lg transition-all">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-10 pt-4 space-y-12 custom-scrollbar">
                        {/* 1. Geographical Selection */}
                        <div className="space-y-6">
                            <div className="flex items-center justify-between px-2">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-slate-400" />
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-900">Regional Scoping</h4>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                                {loadingDirectory ? (
                                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400">
                                        <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin mb-2" />
                                        <p className="text-xs font-bold uppercase tracking-widest">Scanning Global Registry...</p>
                                    </div>
                                ) : stateOptions.length === 0 ? (
                                    <div className="col-span-full py-8 text-center text-slate-400 text-sm">
                                        No Master Data available yet.
                                    </div>
                                ) : (
                                    stateOptions.map(st => {
                                        const isSelected = selectedStates.includes(st.name);
                                        const count = st.count || 0;
                                        // Visual code just for display
                                        const displayCode = st.code || st.name.substring(0, 2).toUpperCase();

                                        return (
                                            <button
                                                key={st.name}
                                                onClick={() => toggleState(st.name)}
                                                className={clsx(
                                                    "p-5 rounded-2xl border transition-all text-left group",
                                                    isSelected
                                                        ? "bg-slate-900 border-slate-900 text-white shadow-lg"
                                                        : "bg-white border-slate-200 hover:border-slate-300"
                                                )}
                                            >
                                                <div className={clsx("text-[9px] font-bold tracking-widest uppercase mb-1", isSelected ? "text-slate-400" : "text-slate-300")}>
                                                    {displayCode}
                                                </div>
                                                <div className="text-sm font-bold truncate mb-3" title={st.name}>{st.name}</div>
                                                <div className="flex items-center gap-2">
                                                    <div className={clsx("w-1 h-1 rounded-full", isSelected ? "bg-blue-400" : "bg-slate-200")}></div>
                                                    <span className="text-[9px] font-bold tracking-widest uppercase text-slate-400">
                                                        {count} Rec
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            {/* 2. City Focus */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 px-2">
                                    <Filter className="w-4 h-4 text-slate-400" />
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-900">City Targeting</h4>
                                </div>

                                <div className="space-y-4">
                                    <select
                                        onChange={handleCityChange}
                                        className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold uppercase tracking-wider outline-none cursor-pointer hover:bg-white focus:border-slate-400 transition-all appearance-none shadow-sm"
                                        defaultValue=""
                                    >
                                        <option value="" disabled>Select Target Locations</option>
                                        {cityOptions.map(city => (
                                            <option key={city} value={city} disabled={selectedCities.includes(city)}>{city}</option>
                                        ))}
                                    </select>

                                    <div className="flex flex-wrap gap-2 min-h-[50px] p-4 bg-slate-50 rounded-xl border border-slate-100 shadow-inner">
                                        {selectedCities.map(city => (
                                            <div key={city} className="flex items-center gap-2 pl-3 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-bold uppercase tracking-widest animate-in zoom-in-90 animate-duration-300 shadow-sm">
                                                {city}
                                                <button onClick={() => removeCity(city)} className="p-0.5 hover:bg-slate-50 rounded text-slate-300 hover:text-red-500 transition-all">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                        {selectedCities.length === 0 && <span className="text-[9px] text-slate-300 font-bold self-center ml-1 uppercase tracking-widest">Global Stream</span>}
                                    </div>
                                </div>
                            </div>

                            {/* 3. Parameter Selection */}
                            <div className="space-y-6">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-2">
                                        <Database className="w-4 h-4 text-slate-400" />
                                        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-900">Payload Schema</h4>
                                    </div>
                                </div>

                                <div className="max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                    <div className="flex flex-wrap gap-2">
                                        {availableHeaders.map(h => {
                                            const isSelected = selectedHeaders.includes(h);
                                            return (
                                                <button
                                                    key={h}
                                                    onClick={() => toggleHeader(h)}
                                                    className={clsx(
                                                        "flex items-center gap-3 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border outline-none",
                                                        isSelected
                                                            ? "bg-slate-900 border-slate-900 text-white shadow-md"
                                                            : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                                                    )}
                                                >
                                                    <div className={clsx(
                                                        "w-4 h-4 rounded border flex items-center justify-center transition-all",
                                                        isSelected ? "bg-white border-white" : "bg-white border-slate-200"
                                                    )}>
                                                        {isSelected && <Check className="w-3 h-3 text-slate-900 stroke-[4px]" />}
                                                    </div>
                                                    {h}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <footer className="p-8 px-10 bg-slate-50 border-t border-slate-200 flex justify-between items-center mt-auto">
                        <button
                            disabled={isSyncing}
                            onClick={onClose}
                            className="text-xs font-bold text-slate-400 hover:text-slate-900 transition-all uppercase tracking-widest"
                        >
                            Disconnect
                        </button>
                        <button
                            onClick={() => onSync({
                                states: selectedStates,
                                cities: selectedCities,
                                selectedHeaders: selectedHeaders
                            })}
                            disabled={selectedStates.length === 0 || isSyncing}
                            className="px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all hover:bg-black disabled:opacity-30 shadow-xl shadow-slate-900/10 flex items-center gap-3"
                        >
                            {isSyncing ? (
                                <>
                                    Processing Flow...
                                    <Zap className="w-4 h-4 animate-pulse fill-white shadow-lg" />
                                </>
                            ) : (
                                <>
                                    Execute Extraction
                                    <ChevronRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </footer>
                </div>
            </div>
        </div>
    );
};

export default SyncModal;

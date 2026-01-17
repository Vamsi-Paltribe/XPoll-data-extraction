import { useState, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus,
    Database,
    Search,
    X,
    LayoutGrid,
    Layers,
    AlertTriangle,
    List,
    Layout,
    Wallet,
    Sparkles
} from 'lucide-react';
import {
    DndContext,
    useSensor,
    useSensors,
    PointerSensor,
    DragOverlay,
    closestCenter,
    defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { cn } from '@/utils';
import { useAuth, useBuckets } from '@/hooks';

// Lazy Components
const ConsolidationWizard = lazy(() => import('@/components/ConsolidationWizard'));

import {
    DraggableDroppableBucket,
    BucketCard,
    UnmergeOption
} from '@/components/dashboard';

const DEFAULT_SCHEMA_FIELDS = ['Name', 'Address', 'City', 'State', 'Zip', 'Party'];

const Dashboard = () => {
    const navigate = useNavigate();
    const [showModal, setShowModal] = useState(false);
    const [newRegistry, setNewRegistry] = useState({ name: '', description: '' });
    const [searchQuery, setSearchQuery] = useState('');

    // Schema Builder State
    const [schemaFields, setSchemaFields] = useState<string[]>([]);
    const [customField, setCustomField] = useState('');

    // Merge States
    const [isMergeMode, setIsMergeMode] = useState(false);
    const [mergePair, setMergePair] = useState<{ source: any, target: any } | null>(null);

    // Unmerge states
    const [unmergingBucketId, setUnmergingBucketId] = useState<string | null>(null);
    const [newDataAction, setNewDataAction] = useState<'duplicate' | 'keep_in_a' | 'keep_in_b' | 'isolate' | 'discard'>('duplicate');

    // View States
    const [viewType, setViewType] = useState<'grid' | 'list'>('grid');

    // --- Hooks ---
    const { user } = useAuth();
    const { buckets: registries, createBucket, unmergeBucket, isPending: isLoading } = useBuckets();

    const sensors = useSensors(
        useSensor(PointerSensor, useMemo(() => ({
            activationConstraint: {
                distance: 8,
            },
        }), []))
    );

    const [activeId, setActiveId] = useState<string | null>(null);

    const handleDragStart = (event: any) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event: any) => {
        const { active, over } = event;
        setActiveId(null);

        if (over) {
            const sourceId = active.id.replace('draggable-', '');
            const targetId = over.id;

            if (sourceId !== targetId) {
                const sourceBucket = active.data.current.bucket;
                const targetBucket = over.data.current.bucket;
                setMergePair({ source: sourceBucket, target: targetBucket });
            }
        }
    };

    const toggleField = (field: string) => {
        setSchemaFields(prev =>
            prev.includes(field)
                ? prev.filter(f => f !== field)
                : [...prev, field]
        );
    };

    const addCustomField = () => {
        if (customField && !schemaFields.includes(customField)) {
            setSchemaFields([...schemaFields, customField]);
            setCustomField('');
        }
    };

    const handleCreateRegistry = () => {
        const parameters = schemaFields.map(field => ({
            name: field,
            type: 'text', // Default to text
        }));

        createBucket.mutate({
            ...newRegistry,
            parameters
        }, {
            onSuccess: () => {
                setShowModal(false);
                setNewRegistry({ name: '', description: '' });
                setSchemaFields([]);
            },
            onError: () => {
                window.alert('Failed to initialize registry');
            }
        });
    };

    if (isLoading && registries.length === 0) return (
        <div className="flex flex-col h-[80vh] items-center justify-center space-y-6">
            <div className="w-12 h-12 bg-[#2D384A] rounded-2xl flex items-center justify-center animate-pulse shadow-lg shadow-[#2D384A]/20">
                <LayoutGrid className="w-6 h-6 text-white" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 animate-pulse">Initializing Monitor</p>
        </div>
    );

    const filteredRegistries = (registries as any[]).filter(bucket =>
        (bucket.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            bucket.description?.toLowerCase().includes(searchQuery.toLowerCase())) &&
        !bucket.hiddenByMerge // Backend handles this too, but for safety
    );

    return (
        <div className="animate-in fade-in duration-500 relative min-h-[90vh]">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-[#2D384A] tracking-tight mb-2">Project Dashboard</h1>
                    <p className="text-slate-500 font-medium text-md">System operational. Welcome back.</p>
                </div>

                <div className="flex items-center gap-6">
                    {/* Merge Mode Toggle */}
                    <button
                        onClick={() => setIsMergeMode(!isMergeMode)}
                        className={cn(
                            "group relative bg-white border border-[#2D384A]/10 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-6 min-w-[260px] text-left transition-all",
                            isMergeMode ? "ring-2 ring-[#A8328D] bg-[#A8328D]/5" : "hover:shadow-md hover:border-[#A8328D]/30"
                        )}
                    >
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                                isMergeMode ? "bg-[#A8328D] text-[#EEEEEF]" : "bg-[#EEEEEF] text-[#2D384A] group-hover:text-[#A8328D]"
                            )}>
                                <Layers size={24} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-[#2D384A] uppercase tracking-widest">Consolidation</p>
                                <div className="flex items-center gap-2">
                                    <span className={cn("text-base font-bold transition-colors", isMergeMode ? "text-[#A8328D]" : "text-[#2D384A]")}>
                                        {isMergeMode ? 'Drag to Merge' : 'Enable Merge'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Visual Toggle Switch */}
                        <div className={cn(
                            "w-10 h-6 rounded-full relative transition-colors duration-300",
                            isMergeMode ? "bg-[#A8328D]" : "bg-slate-200 group-hover:bg-slate-300"
                        )}>
                            <div className={cn(
                                "absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300",
                                isMergeMode ? "translate-x-4" : "translate-x-0"
                            )} />
                        </div>
                    </button>

                    <div className="bg-white border border-[#2D384A]/10 rounded-2xl p-4 shadow-sm flex items-center gap-4 min-w-[240px]">
                        <div className="w-12 h-12 bg-[#A8328D]/10 rounded-xl flex items-center justify-center">
                            <Wallet className="w-6 h-6 text-[#A8328D]" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-[#2D384A] uppercase tracking-widest">Available Balance</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-bold text-[#2D384A]">{user?.tokens?.toLocaleString()}</span>
                                <span className="text-xs font-semibold text-[#A8328D]">TOKENS</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <h2 className="text-xl font-bold text-[#2D384A] flex items-center gap-3">
                    <Database size={24} className="text-[#A8328D]" />
                    Active Registries
                </h2>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative group flex-1 md:w-64">
                        <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400 group-focus-within:text-[#2D384A] transition-colors" />
                        <input
                            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-100 rounded-[20px] text-sm font-medium text-[#2D384A] outline-none focus:border-[#A8328D] focus:ring-4 focus:ring-[#A8328D]/5 transition-all placeholder:text-slate-300 shadow-sm"
                            placeholder="Search Buckets..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex bg-white rounded-2xl border border-slate-100 p-1 shadow-sm">
                        <button
                            onClick={() => setViewType('grid')}
                            className={`p-2 rounded-xl transition-all ${viewType === 'grid' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:bg-slate-50"}`}
                        >
                            <Layout size={18} />
                        </button>
                        <button
                            onClick={() => setViewType('list')}
                            className={`p-2 rounded-xl transition-all ${viewType === 'list' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:bg-slate-50"}`}
                        >
                            <List size={18} />
                        </button>
                    </div>

                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-[#2D384A] text-white px-6 py-3 rounded-[20px] text-xs font-bold uppercase tracking-widest hover:bg-black transition-all shadow-lg shadow-[#2D384A]/10 flex items-center gap-2 group hover:-translate-y-1 active:translate-y-0"
                    >
                        <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                        Create Bucket
                    </button>
                </div>
            </div>

            {/* Merge Mode Hint Overlay */}
            <AnimatePresence>
                {isMergeMode && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="mb-8 p-4 bg-indigo-50 border border-indigo-100 rounded-[24px] flex items-center justify-center gap-4"
                    >
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-sm">
                            <Layers size={16} />
                        </div>
                        <p className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                            Drag one Bucket over another to consolidate data
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Grid */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div className={viewType === 'grid'
                    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pb-20"
                    : "flex flex-col gap-4 pb-20 max-w-5xl mx-auto"
                }>
                    {filteredRegistries.map(bucket => (
                        <DraggableDroppableBucket
                            key={bucket._id}
                            bucket={bucket}
                            isMergeMode={isMergeMode}
                            navigate={navigate}
                            setUnmergingBucketId={setUnmergingBucketId}
                            viewType={viewType}
                        />
                    ))}
                </div>

                <DragOverlay dropAnimation={{
                    duration: 250,
                    easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                    sideEffects: defaultDropAnimationSideEffects({
                        styles: {
                            active: {
                                opacity: '0.4',
                            },
                        },
                    }),
                }}>
                    {activeId ? (
                        <div className="scale-105 rotate-2 brightness-105 shadow-2xl transition-transform duration-200">
                            <BucketCard
                                bucket={(registries as any[]).find(r => `draggable-${r._id}` === activeId)}
                                isMergeMode={isMergeMode}
                                isDraggedOver={false}
                                onNavigate={() => { }}
                                onUnmerge={() => { }}
                                isDragging={false}
                            />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            {/* Merge Wizard */}
            {mergePair && (
                <Suspense fallback={null}>
                    <ConsolidationWizard
                        initialSource={mergePair.source}
                        initialTarget={mergePair.target}
                        onClose={() => setMergePair(null)}
                        onCompleted={() => {
                            setMergePair(null);
                            setIsMergeMode(false);
                        }}
                    />
                </Suspense>
            )}
            {unmergingBucketId && (
                <div className="fixed inset-0 z-[301] bg-[#2D384A]/60 backdrop-blur-md flex items-center justify-center p-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-[#EEEEEF] p-1 w-full max-w-lg rounded-[32px] shadow-2xl border border-white/20 overflow-hidden"
                    >
                        <div className="bg-white p-8 rounded-[28px]">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-600">
                                    <AlertTriangle className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-[#2D384A] tracking-tight">Revert Merge</h2>
                                    <p className="text-[10px] font-bold text-[#2D384A] uppercase tracking-widest">System Restoration Protocol</p>
                                </div>
                            </div>

                            <p className="text-sm text-[#2D384A]/60 font-medium leading-relaxed mb-8">
                                Executing unmerge. Please determine the routing for data ingested <span className="text-[#A8328D] font-bold">post-consolidation</span>.
                            </p>

                            <div className="space-y-3 mb-10">
                                <UnmergeOption
                                    active={newDataAction === 'duplicate'}
                                    title="Mirror to Lineage"
                                    desc="Replicate post-merge records into both original parent Buckets."
                                    onClick={() => setNewDataAction('duplicate')}
                                />
                                <UnmergeOption
                                    active={newDataAction === 'keep_in_a'}
                                    title="Restore to Primary"
                                    desc="Route all subsequent data back to the primary source Bucket."
                                    onClick={() => setNewDataAction('keep_in_a')}
                                />
                                <UnmergeOption
                                    active={newDataAction === 'isolate'}
                                    title="Isolate Delta"
                                    desc="Move post-merge data into a fresh, independent registry."
                                    onClick={() => setNewDataAction('isolate')}
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setUnmergingBucketId(null)}
                                    className="flex-1 px-6 py-4 text-[10px] font-bold text-[#2D384A] hover:text-[#2D384A] transition-all uppercase tracking-widest"
                                >
                                    Abort
                                </button>
                                <button
                                    onClick={() => unmergeBucket.mutate({ id: unmergingBucketId, action: newDataAction }, {
                                        onSuccess: () => setUnmergingBucketId(null)
                                    })}
                                    className="flex-[2] px-8 py-4 bg-[#2D384A] text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#A8328D] transition-all shadow-lg shadow-[#2D384A]/10"
                                >
                                    {unmergeBucket.isPending ? 'Processing...' : 'Confirm Restoration'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {registries.length === 0 && !isLoading && (
                <div className="mt-20 flex flex-col items-center justify-center p-16 text-center bg-white/50 backdrop-blur-sm rounded-[40px] border border-[#2D384A]/5 max-w-2xl mx-auto shadow-sm">
                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-8 rotate-3 shadow-xl shadow-[#2D384A]/5">
                        <Database className="w-8 h-8 text-[#2D384A]/20" />
                    </div>
                    <h2 className="text-2xl font-bold text-[#2D384A] tracking-tight mb-2">Registry Offline</h2>
                    <p className="text-[#2D384A] text-sm max-w-xs mb-10 leading-relaxed font-medium">
                        No active data Buckets detected. Initialize a bucket to begin system ingestion.
                    </p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-10 py-4 bg-[#A8328D] text-white rounded-xl font-bold text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-[#A8328D]/20 hover:bg-[#2D384A] transition-all hover:-translate-y-1"
                    >
                        Initialize Bucket
                    </button>
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-[#2D384A]/70 backdrop-blur-md flex items-center justify-center z-[500] p-6">
                    <div className="bg-[#EEEEEF] p-1.5 rounded-[40px] shadow-3xl max-w-xl w-full border border-white/30 animate-in zoom-in-95 duration-300">
                        <div className="bg-white p-10 rounded-[36px] max-h-[85vh] overflow-y-auto custom-scrollbar">

                            {/* Header */}
                            <div className="flex justify-between items-start mb-10">
                                <div>
                                    <h2 className="text-2xl font-black text-[#2D384A] tracking-tight">Configure Bucket</h2>
                                    <p className="text-[#A8328D] text-[10px] mt-1 font-black uppercase tracking-[0.2em]">Data Ingestion System</p>
                                </div>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="p-3 text-[#2D384A]/40 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"
                                >
                                    <X className="w-6 h-6" strokeWidth={2.5} />
                                </button>
                            </div>

                            <div className="space-y-8">
                                {/* Bucket Identity */}
                                <div className="space-y-3">
                                    <label className="block text-[11px] font-black text-[#2D384A] uppercase tracking-widest ml-1">
                                        Registry Label <span className="text-[#A8328D]">*</span>
                                    </label>
                                    <input
                                        className="w-full px-6 py-5 border-2 border-[#EEEEEF] rounded-[22px] text-sm font-bold text-[#1A1A1A] outline-none focus:bg-white focus:border-[#A8328D] transition-all placeholder:text-[#2D384A]/30"
                                        placeholder="e.g. Q4 Financial Reports"
                                        value={newRegistry.name}
                                        onChange={e => setNewRegistry({ ...newRegistry, name: e.target.value })}
                                        autoFocus
                                    />
                                </div>

                                {/* Extraction Schema Builder */}
                                <div className="space-y-5 pt-8 border-t-2 border-[#EEEEEF]">
                                    <div>
                                        <label className="block text-[11px] font-black text-[#2D384A] uppercase tracking-widest ml-1">Extraction Schema</label>
                                        <p className="text-[12px] text-[#2D384A]/70 mt-1 ml-1 font-bold">What data points should the AI look for?</p>
                                    </div>

                                    {/* Smart Suggestions */}
                                    <div className="flex flex-wrap gap-2.5">
                                        {DEFAULT_SCHEMA_FIELDS.map(field => {
                                            const isActive = schemaFields.includes(field);
                                            return (
                                                <button
                                                    key={field}
                                                    onClick={() => toggleField(field)}
                                                    className={cn(
                                                        "px-5 py-2.5 rounded-xl text-[11px] font-black transition-all border-2",
                                                        isActive
                                                            ? "bg-[#2D384A] text-white border-[#2D384A] shadow-md"
                                                            : "bg-white text-[#2D384A] border-[#EEEEEF] hover:border-[#A8328D] shadow-sm"
                                                    )}
                                                >
                                                    {field.toUpperCase()}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Custom Entry Input */}
                                    <div className="relative group">
                                        <div className="absolute left-5 top-1/2 -translate-y-1/2">
                                            <Sparkles className="w-4 h-4 text-[#A8328D]" strokeWidth={2.5} />
                                        </div>
                                        <input
                                            className="w-full pl-12 pr-20 py-4.5 h-[3rem] bg-white border-2 border-[#2D384A]/10 rounded-[20px] text-[13px] font-bold text-[#1A1A1A] outline-none focus:border-[#A8328D] transition-all placeholder:text-[#2D384A]/40 shadow-inner"
                                            placeholder="Add custom field..."
                                            value={customField}
                                            onChange={e => setCustomField(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addCustomField()}
                                        />
                                        <button
                                            onClick={addCustomField}
                                            disabled={!customField}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2 bg-[#2D384A] text-white rounded-xl text-[10px] font-black uppercase tracking-tight hover:bg-[#A8328D] disabled:opacity-0 transition-all shadow-lg"
                                        >
                                            Add Field
                                        </button>
                                    </div>

                                    {/* Summary of Selection */}
                                    <div className="bg-[#2D384A]/80 rounded-[24px] p-6 shadow-xl">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Active Extraction Fields</span>
                                            <span className="bg-[#A8328D] text-white text-[10px] font-black px-2.5 py-1 rounded-full">{schemaFields.length}</span>
                                        </div>

                                        {schemaFields.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {schemaFields.map(field => (
                                                    <div key={field} className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-2 rounded-lg border border-white/10 group">
                                                        <span className="text-[11px] font-bold text-white uppercase">{field}</span>
                                                        <button onClick={() => toggleField(field)} className="text-white/40 hover:text-white transition-colors">
                                                            <X size={14} strokeWidth={3} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[12px] text-white/30 font-bold text-center py-2 underline decoration-white/10 underline-offset-4">Registry currently empty</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="flex gap-4 mt-12">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="px-8 py-5 text-[11px] font-black text-[#2D384A] hover:bg-[#F4F4F5] rounded-[20px] transition-all uppercase tracking-[0.2em]"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateRegistry}
                                    disabled={!newRegistry.name || schemaFields.length === 0}
                                    className="flex-1 px-8 py-5 bg-[#2D384A] text-white rounded-[22px] text-[11px] font-black uppercase tracking-[0.2em] transition-all hover:bg-[#A8328D] hover:shadow-2xl hover:shadow-[#A8328D]/30 active:scale-[0.97] disabled:opacity-10 shadow-xl shadow-[#2D384A]/20"
                                >
                                    {createBucket.isPending ? 'Processing...' : 'Deploy Registry'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;

import { useState, memo, useMemo, lazy, Suspense } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus,
    Database,
    Search,
    Clock, X,
    ArrowUp,
    LayoutGrid,
    Layers,
    RotateCcw,
    AlertTriangle,
    CheckCircle2,
    List,
    Layout
} from 'lucide-react';
import {
    DndContext,
    useSensor,
    useSensors,
    PointerSensor,
    useDraggable,
    useDroppable,
    DragOverlay,
    closestCenter,
    defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

// Lazy Components
const ConsolidationWizard = lazy(() => import('../components/ConsolidationWizard'));

const BucketCard = memo(({
    bucket,
    isMergeMode,
    isDraggedOver,
    onNavigate,
    onUnmerge,
    attributes,
    listeners,
    setNodeRef,
    style,
    isDragging
}: any) => {
    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => !isMergeMode && onNavigate(bucket._id)}
            className={`bg-white p-8 rounded-[32px] shadow-[0px_4px_20px_rgba(0,0,0,0.03)] border border-white/50 cursor-pointer hover:shadow-[0px_12px_40px_rgba(168,50,141,0.1)] transition-all duration-300 group relative overflow-hidden ${isMergeMode ? "ring-2 ring-indigo-500/10" : ""} ${isDraggedOver ? "ring-4 ring-indigo-500 scale-[1.03] shadow-2xl z-20" : ""} ${isDragging ? "opacity-0" : "opacity-100"}`}
        >
            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-[#A8328D] to-[#F7A25A] opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="flex justify-between items-start mb-8">
                <div className={`w-14 h-14 rounded-[22px] flex items-center justify-center transition-all duration-300 shadow-inner ${bucket.isMerged ? "bg-indigo-600 text-white" : "bg-[#f0f4f9] text-[#2D384A]"
                    }`}>
                    {bucket.isMerged ? <Layers size={26} /> : <Database strokeWidth={1.5} size={26} />}
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${bucket.status === 'paused'
                        ? "bg-slate-50 text-slate-400 border-slate-100"
                        : "bg-emerald-50 text-emerald-700 border-emerald-100"
                        }`}>
                        {bucket.status || 'Active'}
                    </div>
                    {bucket.isMerged && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onUnmerge(bucket._id);
                            }}
                            className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-1.5"
                        >
                            <RotateCcw size={10} /> Unmerge
                        </button>
                    )}
                </div>
            </div>

            <div className="mb-8">
                <h3 className="text-lg font-bold text-[#2D384A] mb-2 group-hover:text-[#A8328D] transition-colors line-clamp-1">{bucket.name}</h3>
                <p className="text-xs font-semibold text-slate-400 flex items-center gap-2 uppercase tracking-wide">
                    <Clock size={12} className="text-[#F7A25A]" />
                    {bucket.lastSyncedAt ? new Date(bucket.lastSyncedAt).toLocaleDateString() : 'New Node'}
                </p>
            </div>

            <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Records</p>
                    <p className="text-2xl font-bold text-[#2D384A] tracking-tight">{(bucket.recordCount || 0).toLocaleString()}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#F8F9FA] flex items-center justify-center text-slate-400 group-hover:bg-[#A8328D] group-hover:text-white transition-all duration-300 shadow-sm">
                    <ArrowUp className="rotate-45" size={18} strokeWidth={2.5} />
                </div>
            </div>
        </div>
    );
});

const BucketListRow = memo(({
    bucket,
    isMergeMode,
    isDraggedOver,
    onNavigate,
    onUnmerge,
    attributes,
    listeners,
    setNodeRef,
    style,
    isDragging
}: any) => {
    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => !isMergeMode && onNavigate(bucket._id)}
            className={`bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-all duration-200 group flex items-center gap-6 ${isMergeMode ? "ring-2 ring-indigo-500/10" : ""} ${isDraggedOver ? "ring-2 ring-indigo-500 bg-indigo-50/30 scale-[1.01]" : ""} ${isDragging ? "opacity-0" : "opacity-100"}`}
        >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bucket.isMerged ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors"}`}>
                {bucket.isMerged ? <Layers size={18} /> : <Database size={18} />}
            </div>

            <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{bucket.name}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mt-0.5">
                    <Clock size={10} />
                    {bucket.lastSyncedAt ? new Date(bucket.lastSyncedAt).toLocaleDateString() : 'New Node'}
                </p>
            </div>

            <div className="hidden md:flex flex-col items-end px-8 border-x border-slate-50">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Records</p>
                <p className="text-lg font-bold text-slate-800 tracking-tight">{(bucket.recordCount || 0).toLocaleString()}</p>
            </div>

            <div className="flex items-center gap-4 shrink-0">
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${bucket.status === 'paused' ? "bg-slate-50 text-slate-400 border-slate-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"}`}>
                    {bucket.status || 'Active'}
                </div>
                {bucket.isMerged && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onUnmerge(bucket._id);
                        }}
                        className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition-all"
                        title="Unmerge"
                    >
                        <RotateCcw size={14} />
                    </button>
                )}
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <ArrowUp className="rotate-45" size={14} strokeWidth={3} />
                </div>
            </div>
        </div>
    );
});

const DraggableDroppableBucket = ({ bucket, isMergeMode, navigate, setUnmergingBucketId, viewType }: any) => {
    const {
        attributes,
        listeners,
        setNodeRef: setDraggableRef,
        transform,
        isDragging,
    } = useDraggable({
        id: `draggable-${bucket._id}`,
        disabled: !isMergeMode,
        data: { bucket }
    });

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: bucket._id,
        disabled: !isMergeMode,
        data: { bucket }
    });

    // Combine refs
    const setNodeRefs = (el: HTMLElement | null) => {
        setDraggableRef(el);
        setDroppableRef(el);
    };

    const style = {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 100 : 1,
    };

    const props = {
        bucket,
        isMergeMode,
        isDraggedOver: isOver && !isDragging,
        onNavigate: (id: string) => navigate(`/registry/${id}`),
        onUnmerge: (id: string) => setUnmergingBucketId(id),
        attributes,
        listeners,
        setNodeRef: setNodeRefs,
        style,
        isDragging
    };

    return viewType === 'grid' ? <BucketCard {...props} /> : <BucketListRow {...props} />;
};

const Dashboard = () => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [showModal, setShowModal] = useState(false);
    const [newRegistry, setNewRegistry] = useState({ name: '', description: '' });
    const [searchQuery, setSearchQuery] = useState('');

    // Merge States
    const [isMergeMode, setIsMergeMode] = useState(false);
    const [mergePair, setMergePair] = useState<{ source: any, target: any } | null>(null);

    // Unmerge states
    const [unmergingBucketId, setUnmergingBucketId] = useState<string | null>(null);
    const [newDataAction, setNewDataAction] = useState<'duplicate' | 'keep_in_a' | 'keep_in_b' | 'isolate' | 'discard'>('duplicate');

    // View States
    const [viewType, setViewType] = useState<'grid' | 'list'>('grid');
    const { data: user } = useQuery({
        queryKey: ['user-me'],
        queryFn: async () => {
            const res = await api.get('/auth/me');
            return res.data;
        }
    });

    const { data: registries = [], isPending: isLoading } = useQuery({
        queryKey: ['registries'],
        queryFn: async () => {
            const res = await api.get('/buckets');
            return res.data as {
                _id: string;
                name: string;
                description?: string;
                recordCount?: number;
                lastSyncedAt?: string,
                status?: 'active' | 'paused',
                isMerged?: boolean,
                hiddenByMerge?: boolean,
                parentLineage?: {
                    parents: string[];
                    mergedAt: string;
                }
            }[];
        }
    });

    // Mutations
    const createRegistryMutation = useMutation({
        mutationFn: (data: { name: string; description: string }) => api.post('/buckets', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registries'] });
            setShowModal(false);
            setNewRegistry({ name: '', description: '' });
        },
        onError: () => {
            window.alert('Failed to initialize registry');
        }
    });

    const unmergeMutation = useMutation({
        mutationFn: ({ id, action }: { id: string, action: string }) => api.post(`/merge/unmerge/${id}`, { newDataAction: action }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registries'] });
            setUnmergingBucketId(null);
        }
    });

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

    if (isLoading && registries.length === 0) return (
        <div className="flex flex-col h-[80vh] items-center justify-center space-y-6">
            <div className="w-12 h-12 bg-[#2D384A] rounded-2xl flex items-center justify-center animate-pulse shadow-lg shadow-[#2D384A]/20">
                <LayoutGrid className="w-6 h-6 text-white" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 animate-pulse">Initializing Monitor</p>
        </div>
    );

    const filteredRegistries = registries.filter(bucket =>
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
                        className={`px-6 py-3 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 shadow-xl ${isMergeMode
                            ? "bg-indigo-600 text-white shadow-indigo-500/20 ring-4 ring-indigo-500/10"
                            : "bg-white text-slate-400 hover:text-slate-900 border border-slate-100"
                            }`}
                    >
                        <Layers size={16} />
                        {isMergeMode ? 'Merge Mode Active' : 'Enter Merge Mode'}
                    </button>

                    <div className="bg-white p-2 rounded-[24px] border border-slate-100 flex items-center gap-4 shadow-sm self-start md:self-auto pr-6">
                        <div className="w-12 h-12 bg-[#F7A25A]/10 rounded-2xl flex items-center justify-center text-[#F7A25A]">
                            <LayoutGrid strokeWidth={2.5} size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Token Balance</p>
                            <p className="text-xl font-extrabold text-[#2D384A]">{user?.tokens?.toLocaleString() || 0} <span className="text-xs text-slate-300 font-bold">TOKENS</span></p>
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
                            placeholder="Search nodes..."
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
                            Drag one node over another to consolidate data
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
                                bucket={registries.find(r => `draggable-${r._id}` === activeId)}
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
                        sourceBucket={mergePair.source}
                        targetBucket={mergePair.target}
                        onClose={() => setMergePair(null)}
                        onComplete={() => {
                            setMergePair(null);
                            setIsMergeMode(false);
                        }}
                    />
                </Suspense>
            )}

            {/* Unmerge Placement Modal */}
            {unmergingBucketId && (
                <div className="fixed inset-0 z-[301] bg-[#2D384A]/40 backdrop-blur-xl flex items-center justify-center p-6">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white p-10 rounded-[40px] shadow-2xl max-w-lg w-full border border-white"
                    >
                        <div className="flex items-center gap-4 mb-8 text-amber-600">
                            <div className="p-3 bg-amber-50 rounded-2xl">
                                <AlertTriangle className="w-7 h-7" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Revert Merge</h2>
                                <p className="text-sm font-bold opacity-60">System restoration protocol</p>
                            </div>
                        </div>

                        <p className="text-sm text-slate-500 font-medium leading-relaxed mb-10">
                            You are about to unmerge this node. How should we handle data that was added <strong>after</strong> the merge was executed?
                        </p>

                        <div className="space-y-4 mb-10">
                            <UnmergeOption
                                active={newDataAction === 'duplicate'}
                                title="Duplicate to Both"
                                desc="Copy all post-merge records into both parent buckets."
                                onClick={() => setNewDataAction('duplicate')}
                            />
                            <UnmergeOption
                                active={newDataAction === 'keep_in_a'}
                                title={`Move to ${registries.find(r => r._id === registries.find(b => b._id === unmergingBucketId)?.parentLineage?.parents?.[0])?.name || 'Primary Parent'}`}
                                desc="Move post-merge data back to the primary bucket only."
                                onClick={() => setNewDataAction('keep_in_a')}
                            />
                            {registries.find(b => b._id === unmergingBucketId)?.parentLineage?.parents?.length! > 1 && (
                                <UnmergeOption
                                    active={newDataAction === 'keep_in_b'}
                                    title={`Move to ${registries.find(r => r._id === registries.find(b => b._id === unmergingBucketId)?.parentLineage?.parents?.[1])?.name || 'Secondary Parent'}`}
                                    desc="Move post-merge data back to the secondary bucket only."
                                    onClick={() => setNewDataAction('keep_in_b')}
                                />
                            )}
                            <UnmergeOption
                                active={newDataAction === 'isolate'}
                                title="Isolate in New Bucket"
                                desc="Create a new bucket specifically for the post-merge records."
                                onClick={() => setNewDataAction('isolate')}
                            />
                            <UnmergeOption
                                active={newDataAction === 'discard'}
                                title="Discard New Data"
                                desc="Only restore original records; delete any data added during merge."
                                onClick={() => setNewDataAction('discard')}
                            />
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setUnmergingBucketId(null)}
                                className="flex-1 px-6 py-4 text-xs font-black text-slate-400 hover:text-slate-900 transition-all uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => unmergeMutation.mutate({ id: unmergingBucketId, action: newDataAction })}
                                className="flex-[2] px-8 py-5 bg-slate-900 text-white rounded-[24px] text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-900/10"
                            >
                                {unmergeMutation.isPending ? 'Processing...' : 'Execute Unmerge'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {registries.length === 0 && !isLoading && (
                <div className="mt-20 flex flex-col items-center justify-center p-20 text-center bg-white rounded-[40px] border border-slate-100 max-w-2xl mx-auto shadow-sm">
                    <div className="w-24 h-24 bg-[#f0f4f9] rounded-[32px] flex items-center justify-center mb-8 rotate-3 shadow-inner">
                        <Database className="w-10 h-10 text-slate-300" />
                    </div>
                    <h2 className="text-2xl font-bold text-[#2D384A] tracking-tight mb-3">No Bucket Active</h2>
                    <p className="text-slate-400 text-sm max-w-sm mb-10 leading-relaxed font-medium">There are currently no active data registries online. Initialize your first node to begin system ingestion.</p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="px-10 py-5 bg-[#2D384A] text-white rounded-[24px] font-bold text-xs uppercase tracking-widest shadow-xl shadow-[#2D384A]/20 hover:bg-black transition-all hover:-translate-y-1 active:translate-y-0"
                    >
                        Initialize Extraction
                    </button>
                </div>
            )}

            {/* Create Registry Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-[#2D384A]/20 backdrop-blur-md flex items-center justify-center z-[100] p-6 animate-in fade-in duration-300">
                    <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-xl w-full border border-white animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h2 className="text-2xl font-bold text-[#2D384A] tracking-tight">Deploy Bucket</h2>
                                <p className="text-slate-400 text-sm mt-1 font-medium">Configure core parameters for a new system registry.</p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-3 text-slate-300 hover:text-[#2D384A] hover:bg-slate-50 rounded-2xl transition-all"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-8 mb-12">
                            <div className="space-y-3">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Registry Label</label>
                                <input
                                    className="w-full px-6 py-4 bg-[#f0f4f9] border border-transparent rounded-[24px] text-sm font-bold text-[#2D384A] outline-none focus:bg-white focus:border-[#2D384A] focus:ring-4 focus:ring-[#2D384A]/5 transition-all placeholder:text-slate-300"
                                    placeholder="e.g. Arizona_North_Core_V4"
                                    value={newRegistry.name}
                                    onChange={e => setNewRegistry({ ...newRegistry, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">System Metadata</label>
                                <textarea
                                    className="w-full px-6 py-4 bg-[#f0f4f9] border border-transparent rounded-[24px] text-sm font-bold text-[#2D384A] outline-none focus:bg-white focus:border-[#2D384A] focus:ring-4 focus:ring-[#2D384A]/5 transition-all h-36 resize-none placeholder:text-slate-300"
                                    placeholder="Define operational boundaries and intended data types..."
                                    value={newRegistry.description}
                                    onChange={e => setNewRegistry({ ...newRegistry, description: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 px-6 py-4 text-xs font-bold text-slate-400 hover:text-[#2D384A] transition-all uppercase tracking-widest"
                            >
                                Discard
                            </button>
                            <button
                                onClick={() => createRegistryMutation.mutate(newRegistry)}
                                disabled={!newRegistry.name || createRegistryMutation.isPending}
                                className="flex-[2] px-6 py-5 bg-[#2D384A] text-white rounded-[24px] text-xs font-bold uppercase tracking-widest transition-all hover:bg-black disabled:opacity-50 shadow-xl shadow-[#2D384A]/20"
                            >
                                {createRegistryMutation.isPending ? 'Processing...' : 'Deploy Registry'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const UnmergeOption = ({ title, desc, active, onClick }: any) => (
    <div
        onClick={onClick}
        className={`p-5 rounded-3xl border-2 transition-all cursor-pointer flex items-center gap-4 ${active ? "bg-indigo-50/50 border-indigo-600 shadow-xl shadow-indigo-500/5" : "bg-white border-slate-50 hover:border-slate-200"
            }`}
    >
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${active ? "border-indigo-600 bg-indigo-600" : "border-slate-200"
            }`}>
            {active && <CheckCircle2 className="w-4 h-4 text-white" />}
        </div>
        <div>
            <p className="text-sm font-black text-slate-900">{title}</p>
            <p className="text-[11px] text-slate-500 font-bold">{desc}</p>
        </div>
    </div>
);

export default Dashboard;

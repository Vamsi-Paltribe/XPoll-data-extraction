import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { BucketCard } from './BucketCard';
import { BucketListRow } from './BucketListRow';

interface DraggableDroppableBucketProps {
    bucket: any;
    isMergeMode: boolean;
    navigate: (path: string) => void;
    setUnmergingBucketId: (id: string) => void;
    viewType: 'grid' | 'list';
}

export const DraggableDroppableBucket = ({ bucket, isMergeMode, navigate, setUnmergingBucketId, viewType }: DraggableDroppableBucketProps) => {
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

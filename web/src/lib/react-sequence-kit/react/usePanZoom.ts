import { useState, useCallback, useRef } from 'react';

export interface ViewportState {
    x: number;
    y: number;
    zoom: number;
}

export const usePanZoom = (initialZoom = 1) => {
    const [transform, setTransform] = useState<ViewportState>({ x: 0, y: 0, zoom: initialZoom });
    const isDragging = useRef(false);
    const lastPoint = useRef({ x: 0, y: 0 });

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        // Middle mouse or Space+Left (handled by caller preventing default usually)
        // For now, let's allow left click to drag background if it's not on an interactive element
        // But better: Require Space bar or Middle click for pan to avoid conflict with selection
        // Simpler MVP: Always pan if background clicked

        // Only capture left click (0) or middle (1)
        if (e.button !== 0 && e.button !== 1) return;

        (e.target as Element).setPointerCapture(e.pointerId);
        isDragging.current = true;
        lastPoint.current = { x: e.clientX, y: e.clientY };
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging.current) return;

        const dx = e.clientX - lastPoint.current.x;
        const dy = e.clientY - lastPoint.current.y;

        setTransform(prev => ({
            ...prev,
            x: prev.x + dx,
            y: prev.y + dy,
        }));

        lastPoint.current = { x: e.clientX, y: e.clientY };
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        isDragging.current = false;
        (e.target as Element).releasePointerCapture(e.pointerId);
    }, []);

    const onWheel = useCallback((e: React.WheelEvent) => {
        // Prevent browser zoom? User handles this potentially.
        if (e.ctrlKey) {
            // Pinch zoom logic or Ctrl+Wheel
            e.preventDefault();
            const ZOOM_SPEED = 0.001;
            const newZoom = Math.max(0.1, Math.min(5, transform.zoom - e.deltaY * ZOOM_SPEED));

            // Improve "Zoom towards mouse" later. Center zoom for now.
            setTransform(prev => ({ ...prev, zoom: newZoom }));
        } else {
            // Pan
            setTransform(prev => ({
                ...prev,
                x: prev.x - e.deltaX,
                y: prev.y - e.deltaY,
            }));
        }
    }, [transform.zoom]);

    return {
        transform,
        setTransform,
        panZoomHandlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onWheel // Note: Wheel often needs passive: false listeners attached via ref, not React prop for full control
        }
    };
};

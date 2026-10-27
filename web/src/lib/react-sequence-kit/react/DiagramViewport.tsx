import React, { useRef, useEffect } from 'react';
import { usePanZoom } from './usePanZoom';

interface DiagramViewportProps {
    width: number;
    height: number;
    children: React.ReactNode;
}

export const DiagramViewport: React.FC<DiagramViewportProps> = ({ width, height, children }) => {
    const { transform, panZoomHandlers } = usePanZoom();
    const containerRef = useRef<HTMLDivElement>(null);

    // React's onWheel is passive by default, so we can't preventDefault (ctrl+zoom).
    // We need to attach a non-passive listener manually.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                // We'll let the React handler process the logic, 
                // but we suppress the browser zoom here.
            }
        };

        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, []);

    return (
        <div
            ref={containerRef}
            className="diagram-viewport"
            style={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                background: '#f8f9fa', // Distinct diagram background
                cursor: 'grab',
                position: 'relative',
                touchAction: 'none' // Important for pointer events
            }}
            {...panZoomHandlers}
        >
            {/* 
         We transform a container GROUP, not the SVG itself usually, 
         or we transform the SVG's root group. 
         Transforming the SVG itself (via CSS) is easiest for infinite canvas.
      */}
            <div
                style={{
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
                    transformOrigin: '0 0',
                    width: width, // The logical width of content
                    height: height,
                    pointerEvents: 'none' // Let events pass through to children? 
                    // Actually, we want children (actors) to be interactive.
                    // But the DRAG event is on the parent wrapper.
                }}
            >
                {/* Re-enable pointer events for the internal diagram */}
                <div style={{ pointerEvents: 'auto' }}>
                    {children}
                </div>
            </div>

            {/* Optional: Zoom Controls UI overlay could go here */}
        </div>
    );
};

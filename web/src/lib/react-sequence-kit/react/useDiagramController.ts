import { useState, useEffect, useRef } from 'react';
import { DiagramController } from '../engine/DiagramController';
import type { DiagramData } from '../engine/model.types';

export function useDiagramController(initialData?: DiagramData) {
    // Stable reference to the controller
    const controllerRef = useRef<DiagramController | null>(null);
    if (!controllerRef.current) {
        controllerRef.current = new DiagramController(initialData);
    }
    const controller = controllerRef.current;

    // React 18+ Sync External Store pattern is best for mutable external sources,
    // but for simplicity and broad compatibility, we'll use a standard subscribe effect + useState/useReducer forceUpdate.
    const [data, setData] = useState<DiagramData>(controller.getModel());

    useEffect(() => {
        const unsubscribe = controller.subscribe(() => {
            // Provide a new object reference to trigger re-render
            setData({ ...controller.getModel() });
        });
        return unsubscribe;
    }, [controller]);

    return {
        data,
        controller
    };
}

export function getStatusColor(status: string): string {
    if (status.startsWith('2')) return 'text-emerald-500';
    if (status === 'pending') return 'text-amber-500 animate-pulse';
    if (status === 'timeout') return 'text-red-400';
    if (status.startsWith('4') || status.startsWith('5')) return 'text-red-400';
    return 'text-slate-400';
}

export function getMethodBadgeClasses(method: string): string {
    switch (method) {
        case 'GET': return 'bg-blue-500/20 text-blue-400';
        case 'POST': return 'bg-green-500/20 text-green-400';
        case 'PUT': return 'bg-yellow-500/20 text-yellow-400';
        case 'DELETE': return 'bg-red-500/20 text-red-400';
        default: return 'bg-slate-700 text-slate-300';
    }
}

export function isErrorStatus(status: string): boolean {
    return status.startsWith('4') || status.startsWith('5');
}

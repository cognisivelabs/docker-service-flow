import { WSMessage } from '@/types/flow';

/**
 * Parse one WebSocket frame into messages. The server batches queued messages
 * into a single frame separated by newlines; compact JSON never contains a raw
 * newline, so splitting on it is safe. A malformed line is reported and
 * skipped without losing the rest of the batch.
 */
export function parseWSFrame(data: string): WSMessage[] {
    const messages: WSMessage[] = [];
    for (const line of data.split('\n')) {
        if (!line.trim()) continue;
        try {
            messages.push(JSON.parse(line));
        } catch (err) {
            console.error('Error parsing WS message:', err);
        }
    }
    return messages;
}

// Repro: a user-CANCELLED tool call is indistinguishable from a genuine tool
// CRASH at the result level. Both are `output-error` + `{ error: <string> }`;
// only the hardcoded English string differs.
//
//   npm install && npm start
//
// No API key: a mock adapter drives the tool call deterministically.

import type { AdapterYieldChunk, AnyTextAdapter, StreamChunk, Tool } from '@tanstack/ai'
import { chat, EventType } from '@tanstack/ai'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'

const mock = (iters: Array<Array<AdapterYieldChunk>>) => {
	let i = 0
	return {
		kind: 'text',
		name: 'mock',
		model: 'test-model',
		'~types': {},
		chatStream: () => {
			const cs = iters[i] ?? []
			i++
			return (async function* () {
				for (const c of cs) yield c
			})()
		},
		structuredOutput: async () => ({ data: {}, rawText: '{}' }),
	} as unknown as AnyTextAdapter
}

const collect = async (s: AsyncIterable<StreamChunk>) => {
	const out: Array<StreamChunk> = []
	for await (const c of s) out.push(c)
	return out
}

const C = {
	runStarted: { type: EventType.RUN_STARTED, runId: 'r1', threadId: 't1', timestamp: 1 },
	toolStart: {
		type: EventType.TOOL_CALL_START,
		toolCallId: 'tool-call-1',
		toolCallName: 'search',
		toolName: 'search',
		timestamp: 1,
	},
	toolArgs: {
		type: EventType.TOOL_CALL_ARGS,
		toolCallId: 'tool-call-1',
		delta: '{"query":"x"}',
		timestamp: 1,
	},
	toolFinished: {
		type: EventType.RUN_FINISHED,
		runId: 'r1',
		threadId: 't1',
		finishReason: 'tool_calls',
		timestamp: 1,
	},
	runFinished: {
		type: EventType.RUN_FINISHED,
		runId: 'r1',
		threadId: 't1',
		finishReason: 'stop',
		timestamp: 1,
	},
} as unknown as Record<string, AdapterYieldChunk>

const search = { name: 'search', description: 'search tool' } as unknown as Tool
const resultOf = (cs: Array<StreamChunk>) =>
	cs.find((c) => c.type === EventType.TOOL_CALL_RESULT) as any

const persistence = memoryPersistence()

// phase 1: model calls the tool -> run pauses on a client-tool interrupt
await collect(
	chat({
		adapter: mock([[C.runStarted, C.toolStart, C.toolArgs, C.toolFinished]]),
		messages: [{ role: 'user', content: 'hi' }],
		tools: [search],
		runId: 'r1',
		threadId: 't1',
		middleware: [withPersistence(persistence)],
	}) as AsyncIterable<StreamChunk>
)

// phase 2: user CANCELS the pending tool call
const cancelled = await collect(
	chat({
		adapter: mock([[C.runStarted, C.runFinished]]),
		messages: [],
		tools: [search],
		runId: 'r1',
		threadId: 't1',
		resume: [{ interruptId: 'client_tool_tool-call-1', status: 'cancelled' }] as any,
		middleware: [withPersistence(persistence)],
	}) as AsyncIterable<StreamChunk>
)

// contrast: a genuine crash — a server tool whose execute() throws
const failed = await collect(
	chat({
		adapter: mock([[C.runStarted, C.toolStart, C.toolArgs, C.toolFinished]]),
		messages: [{ role: 'user', content: 'hi' }],
		runId: 'r1',
		threadId: 't1',
		tools: [
			{
				...search,
				execute: () => {
					throw new Error('database exploded')
				},
			} as any,
		],
	}) as AsyncIterable<StreamChunk>
)

console.log('--- CANCELLED (user said no / changed their mind) ---')
console.log(JSON.stringify(resultOf(cancelled), null, 2))
console.log('\n--- GENUINE CRASH (execute threw) ---')
console.log(JSON.stringify(resultOf(failed), null, 2))
console.log('\nSame type / role / metadata.tanstack.state=output-error / {error:<string>} content.')
console.log('Only the error string differs — nothing structural separates them.')

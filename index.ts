// Repro: an approval-DENIED tool call is indistinguishable from a genuine tool
// CRASH. Both come back as `metadata.tanstack.state: "output-error"` +
// `content: { error: <string> }` — only the hardcoded string differs, and that
// string is all that survives into the persisted ModelMessage transcript.
//
//   npm install && npm start
//
// No API key — a mock adapter drives the tool call deterministically.

import type { AdapterYieldChunk, AnyTextAdapter, StreamChunk, Tool } from '@tanstack/ai'
import { chat, EventType } from '@tanstack/ai'

const mock = (chunks: Array<AdapterYieldChunk>) =>
	({
		kind: 'text',
		name: 'mock',
		model: 'test-model',
		'~types': {},
		chatStream: () =>
			(async function* () {
				for (const c of chunks) yield c
			})(),
		structuredOutput: async () => ({ data: {}, rawText: '{}' }),
	}) as unknown as AnyTextAdapter

const collect = async (s: AsyncIterable<StreamChunk>) => {
	const out: Array<StreamChunk> = []
	for await (const c of s) out.push(c)
	return out
}
const resultOf = (cs: Array<StreamChunk>) =>
	cs.find((c) => c.type === EventType.TOOL_CALL_RESULT) as any

const runStarted = { type: EventType.RUN_STARTED, runId: 'r1', threadId: 't1', timestamp: 1 }
const runFinished = {
	type: EventType.RUN_FINISHED,
	runId: 'r1',
	threadId: 't1',
	finishReason: 'stop',
	timestamp: 1,
}
const toolCall = {
	id: 'tool-call-1',
	type: 'function',
	function: { name: 'search', arguments: '{"query":"x"}' },
}

// (1) User DENIES a needsApproval tool. Stateless: the paused turn is in
// `messages` and the decision rides in on `resume` (no server storage).
const denied = await collect(
	chat({
		adapter: mock([runStarted, runFinished] as any),
		messages: [
			{ role: 'user', content: 'search please' },
			{ role: 'assistant', content: '', toolCalls: [toolCall] },
		] as any,
		tools: [{ name: 'search', description: 'search tool', needsApproval: true } as unknown as Tool],
		runId: 'r2',
		parentRunId: 'r1',
		threadId: 't1',
		resume: [
			{ interruptId: 'approval_tool-call-1', status: 'resolved', payload: { approved: false } },
		] as any,
	}) as AsyncIterable<StreamChunk>
)

// (2) A genuine crash: a server tool whose execute() throws.
const crashed = await collect(
	chat({
		adapter: mock([
			runStarted,
			{
				type: EventType.TOOL_CALL_START,
				toolCallId: 'tool-call-1',
				toolCallName: 'search',
				toolName: 'search',
				timestamp: 1,
			},
			{
				type: EventType.TOOL_CALL_ARGS,
				toolCallId: 'tool-call-1',
				delta: '{"query":"x"}',
				timestamp: 1,
			},
			{
				type: EventType.RUN_FINISHED,
				runId: 'r1',
				threadId: 't1',
				finishReason: 'tool_calls',
				timestamp: 1,
			},
		] as any),
		messages: [{ role: 'user', content: 'search please' }] as any,
		tools: [
			{
				name: 'search',
				description: 'search tool',
				execute: () => {
					throw new Error('database exploded')
				},
			} as unknown as Tool,
		],
		runId: 'r1',
		threadId: 't1',
	}) as AsyncIterable<StreamChunk>
)

console.log('--- DENIED (user said no) ---')
console.log(JSON.stringify(resultOf(denied), null, 2))
console.log('\n--- GENUINE CRASH (execute threw) ---')
console.log(JSON.stringify(resultOf(crashed), null, 2))
console.log('\nSame type / role / metadata.tanstack.state=output-error / {error:<string>}.')
console.log('Only the error string differs — nothing structural separates them.')

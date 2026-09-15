# Repro: denied/cancelled tool call == genuine failure (`@tanstack/ai`)

An approval-**denied** (or **cancelled**) tool call is emitted with the exact same shape as a
genuine tool **crash**: `metadata.tanstack.state: "output-error"` + `content: { error: <string> }`.
The only thing distinguishing them is the hardcoded English error string — which is also all that
survives into the persisted `ModelMessage` transcript a UI re-hydrates from.

## Run

```
npm install
npm start
```

No API key — a mock adapter drives the tool call. Single `chat()` call per case, no persistence.

## Output

```
--- DENIED (user said no) ---
{ "type": "TOOL_CALL_RESULT", "role": "tool",
  "content": "{\"error\":\"User declined tool execution\"}",
  "metadata": { "tanstack": { "state": "output-error" } } }

--- GENUINE CRASH (execute threw) ---
{ "type": "TOOL_CALL_RESULT", "role": "tool",
  "content": "{\"error\":\"database exploded\"}",
  "metadata": { "tanstack": { "state": "output-error" } } }
```

Verified against `@tanstack/ai@0.54.0` (also reproduces on `0.53.0`).

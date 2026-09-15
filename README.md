# Repro: cancelled/denied tool call == genuine failure (`@tanstack/ai`)

A user-**cancelled** (or approval-**denied**) tool call is emitted with the exact same shape as a
genuine tool **crash**: `metadata.tanstack.state: "output-error"` + `content: { error: <string> }`.
The only thing that distinguishes them is the hardcoded English error string, which is also all
that survives into the persisted `ModelMessage` transcript.

## Run

```
npm install
npm start
```

No API key — a mock adapter drives the tool call deterministically.

## Expected output

```
--- CANCELLED (user said no / changed their mind) ---
{ "type": "TOOL_CALL_RESULT", "role": "tool",
  "content": "{\"error\":\"Tool execution cancelled\"}",
  "metadata": { "tanstack": { "state": "output-error" } } }

--- GENUINE CRASH (execute threw) ---
{ "type": "TOOL_CALL_RESULT", "role": "tool",
  "content": "{\"error\":\"database exploded\"}",
  "metadata": { "tanstack": { "state": "output-error" } } }
```

Verified against `@tanstack/ai@0.54.0` + `@tanstack/ai-persistence@0.5.7`.

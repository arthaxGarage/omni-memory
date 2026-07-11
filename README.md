# omni-memory

A personal, fully-local AI memory system. Save notes, code snippets, or terminal
output to a vector database on your machine, then retrieve relevant context from the
terminal, direct API calls, or automatically inside Claude Code.

No cloud, no external services - embeddings run locally via [Ollama](https://ollama.com)
and vectors are stored in a single SQLite file with the
[sqlite-vec](https://github.com/asg017/sqlite-vec) extension.

## Architecture

```
remember "..."  ┐
ingest scripts  ┼──► Express hub (127.0.0.1:8000) ──► SQLite + sqlite-vec (memories.db)
Claude Code MCP ┘            │
                             └──► Ollama (nomic-embed-text, 768-dim embeddings)
```

- **`src/server.ts`** - Express hub; API-key auth + centralized error handling.
- **`src/routes/`** - `remember`, `query`, `list`, `forget`, `health`.
- **`src/lib/`** - `db` (schema + all data access: insert, cosine search, list, delete),
  `embed`, `chunk`, `dedupe`, `store` (shared insert path), `sql` (parameterized filter
  builders), `types`.
- **`src/mcp/index.ts`** — MCP server exposing `search_memory`, `save_memory`, `forget_memory`.
- **`scripts/`** — `ingest`, `ingest-folder`, `query`, `dedupe-existing` CLIs.

## Install on a new machine

### Prerequisites
- **Node.js 20+** and **npm** — <https://nodejs.org>
  - The storage layer (`better-sqlite3`, `sqlite-vec`) installs prebuilt native binaries
    on Windows x64, macOS, and Linux x64/arm64 - no compiler needed. Windows on ARM is
    not covered by sqlite-vec's prebuilds.
- **Git**
- **Ollama** — install from <https://ollama.com/download> (Windows/macOS/Linux), then
  confirm it's running: `ollama --version`. It serves on `http://localhost:11434`.
- **Claude Code** (optional, for the MCP tools) — <https://claude.com/claude-code>

### 1. Clone and install
```bash
git clone <your-repo-url> omni-memory
cd omni-memory
npm install
```

### 2. Pull the embedding model
```bash
ollama pull nomic-embed-text
```

### 3. Configure `.env`
Create `.env` in the project root (it is gitignored — never commit real keys). Generate
a random API key with Node:
```bash
node -e "console.log('omni-' + require('crypto').randomBytes(16).toString('hex'))"
```
Then put it in `.env`, and point `DB_PATH` at where you want vectors stored (use a path
for your OS — any writable folder, created on first use):
```
OMNI_API_KEY=omni-<the-generated-key>
DB_PATH=C:/Users/<you>/.ai_memory      # Windows
# DB_PATH=/home/<you>/.ai_memory       # Linux
# DB_PATH=/Users/<you>/.ai_memory      # macOS
OLLAMA_URL=http://localhost:11434
PORT=8000
```
If `DB_PATH` is omitted it defaults to `~/.ai_memory` (via `USERPROFILE`/`HOME`).

### 4. Build
```bash
npm run build
```

### 5. Start the hub
**Windows** — register a hidden Task Scheduler task that starts at every logon:
```powershell
.\install-service.ps1
```
**macOS / Linux** — run in the foreground (any OS):
```bash
npm start            # or `npm run dev` for tsx without a build
```
To start it automatically at login on **Linux** with systemd, create a user service at
`~/.config/systemd/user/omni-memory.service`:
```ini
[Unit]
Description=omni-memory hub
After=network.target

[Service]
WorkingDirectory=%h/omni-memory
ExecStart=/usr/bin/node %h/omni-memory/dist/server.js
Restart=on-failure

[Install]
WantedBy=default.target
```
Then enable it (adjust the paths to your clone and `node`):
```bash
systemctl --user daemon-reload
systemctl --user enable --now omni-memory
systemctl --user status omni-memory     # check it's running
```
On **macOS**, the simplest equivalent is a `launchd` agent in
`~/Library/LaunchAgents/`, or just run `npm start` in a terminal.

The hub creates the SQLite database (`memories.db` inside `DB_PATH`) on first start.
Backup is just copying that file.

### 6. Register the MCP server in Claude Code
So Claude can call `search_memory` / `save_memory` / `forget_memory`, register the server
at user scope (use the **absolute path to *your* clone's** `dist/mcp/index.js`, and the
**same key** as `.env`):
```bash
claude mcp add omni-memory --scope user \
  --env OMNI_API_KEY=omni-<the-generated-key> \
  --env OMNI_HUB_URL=http://127.0.0.1:8000 \
  -- node /path/to/omni-memory/dist/mcp/index.js
```
This writes the entry into `~/.claude.json`. To configure it by hand instead, add this
under `mcpServers` in `~/.claude.json`:
```json
{
  "mcpServers": {
    "omni-memory": {
      "command": "node",
      "args": ["C:\\path\\to\\omni-memory\\dist\\mcp\\index.js"],
      "env": {
        "OMNI_API_KEY": "omni-<the-generated-key>",
        "OMNI_HUB_URL": "http://127.0.0.1:8000"
      }
    }
  }
}
```
Use the right path style for your OS in `args`:
- **Windows:** `"C:\\path\\to\\omni-memory\\dist\\mcp\\index.js"` (escaped backslashes)
- **Linux/macOS:** `"/home/<you>/omni-memory/dist/mcp/index.js"`

Restart Claude Code (MCP config is read at startup) with the hub already running.

### 7. (Optional) `remember` shortcut
So you can save from any terminal with `remember some note`:

**Windows** — add to your `$PROFILE`:
```powershell
$env:OMNI_KEY = "omni-<the-generated-key>"     # same key as .env
$script:_omniHub = "http://127.0.0.1:8000"
function remember {
    param([Parameter(ValueFromRemainingArguments)][string[]]$words)
    $body = @{ text = ($words -join ' '); source_type = "terminal" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$script:_omniHub/remember" -Method POST `
        -Body $body -ContentType "application/json" `
        -Headers @{ "X-API-Key" = $env:OMNI_KEY }
}
```
Reload with `. $PROFILE`.

**Linux / macOS** — add to your `~/.bashrc` or `~/.zshrc`:
```bash
export OMNI_KEY="omni-<the-generated-key>"     # same key as .env
remember() {
    local body
    body=$(python3 -c 'import json,sys; print(json.dumps({"text": " ".join(sys.argv[1:]), "source_type": "terminal"}))' "$@")
    curl -s -X POST http://127.0.0.1:8000/remember \
        -H "X-API-Key: $OMNI_KEY" -H "Content-Type: application/json" \
        -d "$body"
    echo
}
```
Reload with `source ~/.bashrc` (or `~/.zshrc`). Uses `python3` for JSON escaping so it
needs no extra tools; if you prefer `jq`: `-d "$(jq -n --arg t "$*" '{text:$t, source_type:"terminal"}')"`.

### 8. Verify
```bash
# PowerShell
irm http://127.0.0.1:8000/health -Headers @{"X-API-Key"="omni-<key>"}
# bash
curl -H "X-API-Key: omni-<key>" http://127.0.0.1:8000/health
```
Expect `{"status":"ok","ollama":"ok","count":0}`. In Claude Code, ask it to
"search my memory for X" to confirm the MCP tools are wired up.

## API

All endpoints require header `X-API-Key: <key>`. Hub listens on `127.0.0.1:8000`.

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/remember` | `{ text, source_type, tags?, importance? }` |
| `GET`  | `/query` | `?q=...&top_k=5&source=code&tags=odata,accounts` |
| `GET`  | `/list` | `?limit=20&offset=0&source=code&tags=odata` (newest first) |
| `DELETE` | `/forget` | `{ id }` — id must be a UUID |
| `GET`  | `/health` | `{ status, count, ollama }` |

- `source_type` / `source`: `terminal` \| `chat` \| `code`.
- `importance`: `0`–`1` (default `0.5`); higher ranks earlier in `/query` results.
- `tags`: matches memories containing **any** of the given tags.
- `/remember` returns 400 when no chunk longer than 20 characters survives chunking —
  write at least a full sentence.

## Development

```powershell
npm run dev    # run the hub with tsx (no build step)
npm test       # run the Vitest unit suite
npm run build  # compile to dist/
```

After changing `src/`, rebuild and restart the service **cleanly** — kill any stray
`server.js` process first, or the old code keeps port 8000 (see `HOW-TO-USE.md`).

See **`HOW-TO-USE.md`** for daily usage, ingest recipes, and troubleshooting.

# Omni-Memory — How to Use

A personal, fully local AI memory system. Manually save notes, code snippets, or any text
to a vector database on your laptop, then surface relevant context through Claude Code, a
PowerShell alias, or direct API calls.

---

## How It Works (One Paragraph)

Save anything manually with `remember "..."` from any terminal. Bulk-load code
files or notes using the ingest scripts. The Express hub (`127.0.0.1:8000`) handles all
reads/writes to a local SQLite database (with the sqlite-vec extension) via Ollama
embeddings. Claude Code gets `search_memory`,
`save_memory`, and `forget_memory` tools via an MCP server, so Claude can retrieve relevant
context automatically during your sessions.

---

## Daily Usage

### Save something manually
```powershell
remember "the prod database connection string format is host:5432/dbname?sslmode=require"
remember "use the --no-cache flag when the build picks up stale assets"
```
No quotes required for simple text — just type after `remember`.

> **Minimum length:** chunks of 20 characters or fewer are dropped, so very short
> notes (e.g. `remember "test note"`) are rejected with a 400 — nothing is saved.
> Write at least a full sentence.

### Search from the terminal
```powershell
npx tsx scripts/query.ts "how do I filter accounts by status"
npx tsx scripts/query.ts "what was that OData pattern for currencies"
```
Run from the project directory: `C:\path\to\omni-memory` (Windows) or
`~/source/repos/omni-memory` (Linux).

### Search from Claude Code
After starting a Claude Code session, just ask naturally:
> "Search my memory for how I configured the build cache"
> "Do I have any notes on that database connection string format?"

Claude will call `search_memory` automatically. You can also ask it to save something:
> "Save this pattern to my memory"

---

## Ingesting Files

Ingest a single file:

```powershell
cd C:\path\to\omni-memory

# Ingest a TypeScript helper
npx tsx scripts/ingest.ts <path-to-file.ts> code

# Ingest a markdown note or chat export
npx tsx scripts/ingest.ts <path-to-notes.md> chat

# Ingest a terminal log
npx tsx scripts/ingest.ts <path-to-log.txt> terminal
```

Ingest all files in a folder:

```powershell
# Auto-detect source type by extension
npx tsx scripts/ingest-folder.ts C:\path\to\folder

# Walk subdirectories recursively
npx tsx scripts/ingest-folder.ts C:\path\to\folder --recursive

# Force a specific source type for all files
npx tsx scripts/ingest-folder.ts C:\path\to\folder code
```

Auto-detected types: `.ts .tsx .js .jsx .py .cs .json .yaml .yml` → `code` | `.md .txt` → `chat` | `.log` → `terminal`. Other extensions are skipped.

Source types: `code` | `chat` | `terminal`

Duplicate chunks (cosine similarity ≥ 0.97) are skipped automatically.

---

## Maintenance

Storage is a single SQLite file (`memories.db` inside `DB_PATH`). It needs no
compaction or pruning jobs. To inspect it, open it with any SQLite client (load
the sqlite-vec extension for vector functions).

To back it up, stop the hub first (the db runs in WAL mode, so copying only
`memories.db` while the hub is writing can miss the latest changes), copy the
file, then restart:

```powershell
# Windows
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Copy-Item "$env:USERPROFILE\.ai_memory\memories.db" "D:\backups\memories.db"
Start-ScheduledTask -TaskName OmniMemory
```
```bash
# Linux
systemctl --user stop omni-memory
cp ~/.ai_memory/memories.db /path/to/backups/
systemctl --user start omni-memory
```

To collapse near-duplicate rows that are *already* in the table (e.g. stored before
dedup existed), use the one-off sweep — dry run by default:
```powershell
npx tsx scripts/dedupe-existing.ts                          # preview only
npx tsx scripts/dedupe-existing.ts --apply                  # actually delete
npx tsx scripts/dedupe-existing.ts --apply --threshold 0.95 # looser match
```
The oldest row in each duplicate cluster is kept.

---

## Service Management

### Linux (systemd user service)

The hub runs as the systemd user service **omni-memory**
(`~/.config/systemd/user/omni-memory.service`), started at login. Lingering is
enabled (`loginctl enable-linger`), so it also starts at boot without a login.

```bash
systemctl --user status omni-memory     # check
systemctl --user restart omni-memory    # restart (e.g. after npm run build)
systemctl --user stop omni-memory       # stop
journalctl --user -u omni-memory -f     # follow logs
```

### Windows (Task Scheduler)

The hub runs as a Windows Task Scheduler task named **OmniMemory**. It starts automatically
10 seconds after you log in.

> ⚠️ **`Stop-ScheduledTask` does not stop the hub.** The task launches `node` *detached*
> via `launch-hidden.vbs`, so the task's own process exits immediately and the running
> `node` is orphaned. Stopping (or restarting) the task therefore leaves the old `node`
> alive on port 8000 — and a fresh start silently fails to bind. To actually stop or
> restart the hub you must kill the process **listening on port 8000**, as shown below.

```powershell
# Check status (task only — says nothing about whether node is actually running)
Get-ScheduledTask -TaskName OmniMemory | Select-Object TaskName, State

# Stop the hub for real — kill whatever is listening on 8000 (the detached node)
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Start manually
Start-ScheduledTask -TaskName OmniMemory

# Restart cleanly (stop-then-start in one go)
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName OmniMemory

# Confirm the hub is alive (and serving the EXPECTED version, not a stale process)
Invoke-RestMethod http://127.0.0.1:8000/health -Headers @{"X-API-Key"=$env:OMNI_KEY}

# Uninstall the task entirely (kill the running node too, per the stop step above)
Unregister-ScheduledTask -TaskName OmniMemory -Confirm:$false
```

To reinstall after uninstalling (or on a fresh machine):
```powershell
cd C:\path\to\omni-memory
npm run build
.\install-service.ps1
```

---

## API Reference

All endpoints require header `X-API-Key: <your key>`. Hub listens on `127.0.0.1:8000`.

| Method | Path | What it does |
|--------|------|--------------|
| `POST` | `/remember` | Save text to memory. Body: `{ text, source_type, tags?, importance? }` |
| `GET` | `/query` | Search memory. Params: `?q=...&top_k=5&source=code&tags=odata,accounts` |
| `GET` | `/list` | List memories newest-first. Params: `?limit=20&offset=0&source=code&tags=odata` |
| `DELETE` | `/forget` | Delete a memory by ID. Body: `{ id }` (must be a UUID) |
| `GET` | `/health` | Returns `{ status, ollama, count }` — `status` is `ok`/`degraded`, `ollama` is `ok`/`unreachable` |

- `source_type` / `source`: `terminal` \| `chat` \| `code`.
- `importance`: `0`–`1` (default `0.5`); higher ranks earlier in `/query` results.
- `tags` filter matches memories containing **any** of the given tags.
- `/remember` rejects text with a 400 if no chunk longer than 20 characters survives
  chunking — short snippets are never silently dropped.

Quick test from PowerShell:
```powershell
$key = @{"X-API-Key"=$env:OMNI_KEY}   # set from your .env value

# Save (must be > 20 chars or the hub returns 400)
Invoke-RestMethod http://127.0.0.1:8000/remember -Method POST -Headers $key `
  -ContentType "application/json" `
  -Body '{"text":"omni-memory smoke test: the hub stores and retrieves this note","source_type":"chat"}'

# Query
Invoke-RestMethod "http://127.0.0.1:8000/query?q=omni-memory+smoke+test&top_k=3" -Headers $key

# Health
Invoke-RestMethod http://127.0.0.1:8000/health -Headers $key
```

---

## Project Layout

```
omni-memory/
├── src/
│   ├── server.ts           # Express hub entry point
│   ├── middleware/auth.ts  # API key gate
│   ├── routes/             # remember / query / forget / health
│   ├── lib/                # db, embed, chunk, dedupe, store, types
│   └── mcp/index.ts        # MCP server (search_memory + save_memory + forget_memory)
├── scripts/
│   ├── ingest.ts           # Ingest a single file
│   ├── ingest-folder.ts    # Ingest all files in a folder
│   ├── query.ts            # CLI search
│   └── dedupe-existing.ts  # One-off sweep of duplicates already stored
├── dist/                   # Compiled output (run: npm run build)
├── .env                    # API key, DB path, Ollama URL, port
├── install-service.ps1     # Register Task Scheduler task
└── HOW-TO-USE.md           # This file
```

Key paths:
- **Database:** `memories.db` inside the `DB_PATH` from your `.env` (defaults to `~/.ai_memory/`)
- **PowerShell profile:** `$PROFILE` (e.g. `~\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`)
- **Claude Code MCP config:** `~\.claude.json` (user scope, written by `claude mcp add`)

---

## After Code Changes

If you modify any `.ts` file in `src/`, rebuild and restart the service.

**Linux:**
```bash
cd ~/source/repos/omni-memory
npm run build
systemctl --user restart omni-memory
```

**Windows** - note the restart **kills the node on port 8000** — `Stop-ScheduledTask`
alone leaves the old (pre-build) process running, so your changes wouldn't take effect:

```powershell
cd C:\path\to\omni-memory
npm run build
# Kill the detached node holding port 8000, then relaunch via the task
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName OmniMemory
```

---

## Troubleshooting

**Hub not responding**

Windows:
```powershell
# Check if the task is running
Get-ScheduledTask -TaskName OmniMemory | Select-Object State

# Start it manually and check for errors
Start-ScheduledTask -TaskName OmniMemory
Start-Sleep -Seconds 5
Invoke-RestMethod http://127.0.0.1:8000/health -Headers @{"X-API-Key"=$env:OMNI_KEY}

# If still failing, run directly to see the error
node C:\path\to\omni-memory\dist\server.js
```

Linux:
```bash
systemctl --user status omni-memory        # check state
journalctl --user -u omni-memory -n 50     # recent logs
curl -H "X-API-Key: $OMNI_KEY" http://127.0.0.1:8000/health

# If still failing, run directly to see the error
node ~/source/repos/omni-memory/dist/server.js
```

**Ollama not available**
```powershell
ollama list              # should show nomic-embed-text
ollama pull nomic-embed-text   # if missing
# Windows: Ollama auto-starts as a tray app on login — check system tray
# Linux: systemctl status ollama
```

**MCP tools not showing in Claude Code**
- Restart Claude Code (the MCP config is read at startup)
- Confirm the entry exists: `claude mcp list` (or `Get-Content ~\.claude.json | Select-String omni`)
- Make sure the hub is running before starting Claude Code

**`remember` not found in terminal**
```powershell
# Windows: reload the profile manually
. $PROFILE
# Or check if the profile file exists
Test-Path $PROFILE
```
```bash
# Linux: reload the shell config
source ~/.bashrc
```

**Unauthorised errors**
The API key in `.env`, the MCP config, and your shell profile must all match. The key
lives only in `.env` (gitignored) — don't paste the literal value into docs or commits.
- `.env` → `OMNI_API_KEY=`
- `~/.claude.json` → `mcpServers.omni-memory.env.OMNI_API_KEY`
- `$PROFILE` (Windows) → `$env:OMNI_KEY =` | `~/.bashrc` (Linux) → `export OMNI_KEY=`

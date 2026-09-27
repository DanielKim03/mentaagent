# MentaAgent

A self-hostable AI business analyst that runs on open-weight models.

Upload a company's spreadsheets, contracts, PDFs and emails. Ask questions and
get answers that name the file each claim came from. It keeps a memory
of the business and learns playbooks as you use it. Apache 2.0.

<!-- TODO: 20-second GIF (upload a file, ask, see the citation) -->

## Quickstart

You need Docker with Compose v2. No API keys.

```bash
git clone https://github.com/DanielKim03/mentaagent.git
cd mentaagent
docker compose up
```

Open http://localhost:3000 and sign up. That account's workspace is yours.

- The first build takes a few minutes. Later starts take seconds.
- With no model key set, the agent runs on a **stub provider** that returns
  canned answers. Every part of the pipeline (upload, ingest, the agent loop,
  tool calls, streaming, reports) still runs end to end, so you can see how it
  works before spending anything.
- Secrets (`AUTH_SECRET`, `INTERNAL_API_SECRET`) are generated on first run
  and kept in a Docker volume. So are your database and uploaded files.
- Try it with the files in [`samples/`](samples/): a fictional catering
  company's revenue, clients, contracts, vendors and inventory.

### Use a real model

Any OpenAI-compatible endpoint works: a hosted provider, or your own vLLM or
Ollama server. Create a `.env` next to `docker-compose.yml`:

```bash
LLM_BASE_URL=https://api.deepinfra.com/v1/openai
LLM_API_KEY=your-key
AGENT_MODEL=deepseek-ai/DeepSeek-V4-Flash
HEAVY_MODEL=deepseek-ai/DeepSeek-V4-Pro     # report summaries

EMBEDDINGS_BASE_URL=https://api.deepinfra.com/v1/openai
EMBEDDINGS_API_KEY=your-key
EMBEDDINGS_MODEL=BAAI/bge-m3
```

Then `docker compose down && docker compose up`. Your data is kept.

Missing keys turn features off rather than breaking the app. With no embeddings
key, search falls back to Postgres full-text. With no vision model, image
uploads are refused at the door. With no email key, nothing is emailed. Every
option is documented in [`.env.example`](.env.example).

If your model host has no native tool calling, set `LLM_TOOL_MODE=hermes-xml`:
tool schemas go in the system prompt and calls are parsed from the text.

To serve it on your own domain, set `WEB_ORIGIN=https://your.domain` in `.env`
**before** the first build.

## What it does

- **Reads your files.** CSV, Excel, PDF, Word, `.eml`, plain text, and photos
  (through a vision model). Each file is parsed, chunked and embedded in the background.
- **Answers with citations.** The agent investigates with tools over your data
  (search, read, aggregate) and names the source
  document for each claim.
- **Knowledge graph.** Documents are linked to the people, customers, vendors,
  products and contracts they mention. The agent follows those links to reason
  across files, and you can browse them.
- **Remembers.** Per-workspace memory in four categories: business facts,
  owner preferences, advisor notes, open loops. You can read and edit all of it.
  It is written only from conversations, never from document text, so a
  poisoned file cannot plant instructions in it.
- **Learns playbooks.** After a conversation goes idle, a reflection run can
  propose a new skill (a markdown playbook). Nothing is added until you approve
  it.
- **Reports.** A health check across seven dimensions, each investigated with a
  fresh context, then summarised.
- **Alerts.** A weekly monitor run checks what you asked it to watch and
  what changed, and raises alerts only when something is worth raising.

<!-- PART 2 (tonight 20:15): Architecture, Reusable on their own,
     Models tested with cost per question, Why it exists -->

## Status

Built in eight days in June 2026 as a product, stopped before launch, and
released here as finished work rather than a service. There is no hosted
version and no company behind it.

What works: everything above, tested end to end on a fresh clone with
`docker compose up`. What is not built yet: connectors (Google Drive and
others; the seam exists), scheduled digest emails, PDF export of reports
beyond print styles.

The maintainer starts 18 months of military service in October 2026 and will
be slow to answer issues and pull requests until April 2028. The code is
yours to fork.

<!-- PART 2: License, Contributing, Roadmap -->

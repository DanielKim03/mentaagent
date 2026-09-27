# MentaAgent

**An AI business analyst that actually knows your business.** It runs on your
own computer, uses open-weight models, and is free (Apache 2.0).

Give it a company's spreadsheets, contracts, PDFs and emails. It tells you what
the business is lacking, where the risks are, and what to improve, with every
answer naming the file it came from. It remembers what it learns across
conversations.

<!-- TODO: 20-second GIF (upload a file, ask, see the citation) -->

## What you get

**Ask anything about your business.** Upload spreadsheets, contracts, PDFs and
emails. The analyst investigates the real numbers and answers with citations
back to the source.

**Gap-analysis reports.** A health check across finance, customers, contracts,
operations and more: each dimension scored, with the top gaps and what to do
next.

**It remembers and improves.** Per-business memory and learned playbooks mean
it gets sharper at advising you over time, and it flags new risks on a
schedule.

All of it runs on your machine. There is no account, no sign-up, no
subscription. Your files stay on your computer; only what the agent reads is
sent to the model provider you choose.

## Quickstart

You need Docker with Compose v2.

```bash
git clone https://github.com/DanielKim03/mentaagent.git
cd mentaagent
docker compose up
```

Open http://localhost:3000. That's it: no account to create.

1. **Add a model key.** Open **Model & API key** in the sidebar, paste a key
   and press Save. It takes effect within seconds, no restart. The defaults
   use [DeepInfra](https://deepinfra.com/dash/api_keys), where one key covers
   chat, embeddings and image reading. Any other OpenAI-compatible provider
   works too; change the URL and model names on the same page.
2. **Tell it about the business** on the **Profile** page.
3. **Upload files** on the **Data** page. To try it without your own data, use
   [`samples/`](samples/): a fictional catering company's revenue, clients,
   contracts, vendors and inventory.
4. **Ask** in **Chat**.

Without a key the app still runs, on a **stub model** that gives canned
answers. That's useful for seeing how the pieces fit before spending anything,
but not for real questions.

The first build takes a few minutes; later starts take seconds. Your database,
uploaded files and settings are kept in Docker volumes between restarts.

![The Model & API key page](docs/settings.png)

### Good to know

- **Only your computer can open it.** There is no login, so Docker publishes
  the app on `127.0.0.1` only. To reach it from another device, put it behind
  something that does authentication (a VPN such as Tailscale, or a reverse
  proxy with a password). Do not simply open the port.
- **Missing keys turn features off rather than breaking the app.** With no
  embeddings key, search falls back to Postgres full-text. With no vision
  model, image uploads are refused.
- **Reports run on their own**, weekly and monthly once you have uploaded
  files. With a real model each one costs money on your provider's account.
  `LLM_DAILY_USD_CAP` in `.env` sets a daily ceiling.
- **Prefer config files?** Everything on the settings page can also be set in a
  `.env` file next to `docker-compose.yml`; see
  [`.env.example`](.env.example). Values saved in the app win over `.env`.
- **Your model host has no native tool calling?** Choose "Hermes XML" under
  Advanced: tool schemas go in the prompt and calls are parsed from the text.
- **Serving it on another address?** Set `WEB_ORIGIN` in `.env` **before** the
  first build.

## What it does, in detail

- **Reads your files.** CSV, Excel, PDF, Word, `.eml`, plain text, and photos
  (through a vision model). Each file is parsed, chunked and embedded in the
  background.
- **Answers with citations.** The agent investigates with tools over your data
  (search, read, aggregate, calculate) and names the source document for each
  claim.
- **Knowledge graph.** Documents are linked to the people, customers, vendors,
  products and contracts they mention. The agent follows those links to reason
  across files, and you can browse them.
- **Remembers.** Memory in four categories: business facts, owner preferences,
  advisor notes, open loops. You can read and edit all of it. It is written only
  from conversations, never from document text, so a poisoned file cannot
  plant instructions in it.
- **Learns playbooks.** After a conversation goes idle, a reflection run can
  propose a new skill (a markdown playbook). Nothing is added until you approve
  it.
- **Reports.** Seven dimensions, each investigated with a fresh context, then
  summarised by a larger model.
- **Alerts.** A weekly monitor run checks what you asked it to watch and what
  changed, and raises alerts only when something is worth raising.

<!-- PART 2 (tonight 20:15): Architecture, Reusable on their own,
     Models tested with cost per question, Why it exists -->

## Status

Built in eight days in June 2026 as a subscription product, stopped before
launch, and released here as finished work: accounts and billing removed, one
person per install. There is no hosted version and no company behind it.

What works: everything above, tested end to end on a fresh clone with
`docker compose up`. What is not built: connectors (Google Drive and others),
a button to generate a report on demand, PDF export of reports beyond print
styles.

The maintainer starts 18 months of military service in October 2026 and will
be slow to answer issues and pull requests until April 2028. The code is
yours to fork.

<!-- PART 2: License, Contributing, Roadmap -->

// Global test setup — runs before any test module is imported.
//
// Tests MUST never reach a paid LLM (CLAUDE.md invariant): the whole pipeline
// is exercised through the zero-spend stub provider, scripted per test via
// setStubScript(). But env.ts loads the repo-root .env through dotenv, and a
// developer's real .env carries live LLM_API_KEY / EMBEDDINGS_API_KEY for
// running the actual app. Without this, those keys leak into the test process,
// getChatClient() returns a real client, getProvider() picks the real provider
// over the stub, the scripted turns are ignored, and the agent-loop tests hit
// (and bill) the real model — failing on natural-language replies that don't
// match the assertions.
//
// Neutralize them to "" (not delete): this runs before env.ts's dotenv load,
// and dotenv does NOT override an already-set var, so the .env values can't
// re-populate them. env.ts then treats "" as unset → stub provider + FTS-only
// retrieval. Overriding to "" also defeats a key exported in the shell.
process.env.LLM_API_KEY = "";
process.env.EMBEDDINGS_API_KEY = "";
process.env.NODE_ENV = "test";

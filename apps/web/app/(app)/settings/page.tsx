import { redirect } from "next/navigation";
import { apiFetch, apiGet } from "@/lib/api";
import TestConnectionButton from "@/components/TestConnectionButton";

type LlmSettings = {
  saved: {
    llm_base_url: string;
    agent_model: string;
    heavy_model: string;
    llm_tool_mode: string;
    embeddings_base_url: string;
    embeddings_model: string;
    vision_model: string;
    llm_api_key_hint: string | null;
    embeddings_api_key_hint: string | null;
  };
  effective: {
    baseUrl: string;
    agentModel: string;
    heavyModel: string;
    toolMode: string;
    embeddingsBaseUrl: string;
    embeddingsModel: string;
    visionModel: string;
    hasChatKey: boolean;
    hasEmbeddingsKey: boolean;
    hasVisionKey: boolean;
  };
};

// Model provider and API key, entered here instead of in a .env file. Saved
// to the local database; the worker picks changes up within a few seconds.
// Blank fields use the defaults shown as placeholders.

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const { saved, effective } = await apiGet<LlmSettings>("/api/settings/llm");

  async function save(formData: FormData) {
    "use server";
    const str = (k: string) => String(formData.get(k) ?? "").trim();
    const key = (k: string, clear: string) =>
      formData.get(clear) ? "" : str(k) || undefined; // blank = keep saved key
    await apiFetch("/api/settings/llm", {
      method: "PUT",
      body: JSON.stringify({
        llm_api_key: key("llm_api_key", "clear_llm_api_key"),
        llm_base_url: str("llm_base_url"),
        agent_model: str("agent_model"),
        heavy_model: str("heavy_model"),
        llm_tool_mode: str("llm_tool_mode"),
        embeddings_api_key: key("embeddings_api_key", "clear_embeddings_api_key"),
        embeddings_base_url: str("embeddings_base_url"),
        embeddings_model: str("embeddings_model"),
        vision_model: str("vision_model"),
      }),
    });
    redirect("/settings?saved=1");
  }

  const field =
    "rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2.5 font-normal outline-none transition-colors focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";
  const hint = "text-xs font-normal text-neutral-500";
  const host = (u: string) => {
    try {
      return new URL(u).host;
    } catch {
      return u;
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Model &amp; API key</h1>
        <p className="mt-1 text-sm text-neutral-500">
          MentaAgent works with any OpenAI-compatible model provider. Paste a
          key and save; it takes effect within a few seconds, no restart. The
          key stays in the database on this computer.
        </p>
      </div>

      {effective.hasChatKey ? (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          Using <strong>{effective.agentModel}</strong> at {host(effective.baseUrl)}.
          {!effective.hasEmbeddingsKey &&
            " No embeddings key, so search uses keywords only."}
          {!effective.hasVisionKey && " Image uploads are off."}
        </p>
      ) : (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          No API key yet. Answers are canned examples until you add one.
        </p>
      )}
      {searchParams.saved && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">Saved.</p>
      )}

      <form action={save} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          API key
          <input
            name="llm_api_key"
            type="password"
            autoComplete="off"
            placeholder={saved.llm_api_key_hint ? `Saved key ${saved.llm_api_key_hint}. Paste a new one to replace it` : "Paste your key"}
            className={field}
          />
          <span className={hint}>
            The defaults below are DeepInfra, where one key covers chat,
            embeddings and image reading. Get one at{" "}
            <a className="underline" href="https://deepinfra.com/dash/api_keys" target="_blank" rel="noreferrer">
              deepinfra.com
            </a>
            .
          </span>
          {saved.llm_api_key_hint && (
            <span className="flex items-center gap-2 text-xs font-normal text-neutral-600">
              <input type="checkbox" name="clear_llm_api_key" /> Remove the saved key
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Provider URL
          <input name="llm_base_url" defaultValue={saved.llm_base_url} placeholder={effective.baseUrl} className={field} />
          <span className={hint}>
            Any OpenAI-compatible endpoint, ending in /v1 or similar. A local
            server works too.
          </span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Chat model
            <input name="agent_model" defaultValue={saved.agent_model} placeholder={effective.agentModel} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Report model
            <input name="heavy_model" defaultValue={saved.heavy_model} placeholder={effective.heavyModel} className={field} />
          </label>
        </div>

        <details className="rounded-lg border border-neutral-200 p-4">
          <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
          <div className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Tool calling
              <select name="llm_tool_mode" defaultValue={saved.llm_tool_mode} className={field}>
                <option value="">Default ({effective.toolMode})</option>
                <option value="native">Native (the provider supports tools)</option>
                <option value="hermes-xml">Hermes XML (tools described in the prompt)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Embeddings URL
              <input name="embeddings_base_url" defaultValue={saved.embeddings_base_url} placeholder={effective.embeddingsBaseUrl} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Embeddings key
              <input
                name="embeddings_api_key"
                type="password"
                autoComplete="off"
                placeholder={saved.embeddings_api_key_hint ? `Saved key ${saved.embeddings_api_key_hint}` : "Blank: reuse the API key when the URL is the same host"}
                className={field}
              />
              {saved.embeddings_api_key_hint && (
                <span className="flex items-center gap-2 text-xs font-normal text-neutral-600">
                  <input type="checkbox" name="clear_embeddings_api_key" /> Remove the saved embeddings key
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Embeddings model
              <input name="embeddings_model" defaultValue={saved.embeddings_model} placeholder={effective.embeddingsModel} className={field} />
              <span className={hint}>Must return 1024-dimension vectors, like bge-m3.</span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Vision model (reads uploaded photos)
              <input name="vision_model" defaultValue={saved.vision_model} placeholder={effective.visionModel} className={field} />
            </label>
          </div>
        </details>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-stone-950 transition-colors hover:bg-stone-200"
          >
            Save
          </button>
          <TestConnectionButton />
        </div>
      </form>
    </div>
  );
}

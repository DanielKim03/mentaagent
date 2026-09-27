import { redirect } from "next/navigation";
import { apiFetch, apiGet } from "@/lib/api";
import LlmSettingsForm, { type SavedSettings } from "@/components/LlmSettingsForm";

type LlmSettings = {
  saved: SavedSettings;
  effective: {
    baseUrl: string;
    agentModel: string;
    hasChatKey: boolean;
    hasEmbeddingsKey: boolean;
    hasVisionKey: boolean;
  };
};

// Model provider and API key, entered here instead of in a .env file. Saved
// to the local database; the worker picks changes up within a few seconds.

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const { saved, effective } = await apiGet<LlmSettings>("/api/settings/llm");

  async function save(formData: FormData) {
    "use server";
    const str = (k: string) => String(formData.get(k) ?? "").trim();
    // A key field left blank keeps the saved key; a remove box (or switching
    // provider) deletes it.
    const key = (k: string, ...removeFlags: string[]) =>
      removeFlags.some((f) => formData.get(f)) ? "" : str(k) || undefined;
    await apiFetch("/api/settings/llm", {
      method: "PUT",
      body: JSON.stringify({
        provider: str("provider"),
        llm_api_key: key("llm_api_key", "remove_llm_api_key", "clear_llm_api_key"),
        llm_base_url: str("llm_base_url"),
        agent_model: str("agent_model"),
        heavy_model: str("heavy_model"),
        llm_tool_mode: str("llm_tool_mode"),
        embeddings_api_key: key("embeddings_api_key", "remove_embeddings_api_key"),
        embeddings_base_url: str("embeddings_base_url"),
        embeddings_model: str("embeddings_model"),
        vision_base_url: str("vision_base_url"),
        vision_model: str("vision_model"),
      }),
    });
    redirect("/settings?saved=1");
  }

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
          Use your own key from any provider below, or a model running on your
          own computer. It takes effect within a few seconds, no restart. The
          key stays in the database on this computer.
        </p>
      </div>

      {effective.hasChatKey ? (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          Using <strong>{effective.agentModel}</strong> at {host(effective.baseUrl)}.
          {!effective.hasEmbeddingsKey && " Search uses keywords only (no embeddings)."}
          {!effective.hasVisionKey && " Photo uploads are off."}
        </p>
      ) : (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          No API key yet. Answers are canned examples until you add one.
        </p>
      )}
      {searchParams.saved && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          Saved. Press &quot;Test saved settings&quot; to check it works.
        </p>
      )}

      <LlmSettingsForm saved={saved} save={save} />
    </div>
  );
}

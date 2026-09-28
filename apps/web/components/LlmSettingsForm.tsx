"use client";

import { useEffect, useState } from "react";
import { PROVIDERS, providerById, providerForUrl, type Provider } from "@/lib/providers";
import TestConnectionButton from "@/components/TestConnectionButton";

// Model ids that can't answer chat (embeddings, speech, images, rerankers).
// Hidden from the chat and report lists; still reachable via "Other…".
const NOT_CHAT = /(embed|whisper|tts|dall-e|moderation|rerank|transcri|speech|stable-diffusion|flux|sdxl|gpt-image|bge-)/i;
const OTHER = "__other__";

// A click-to-pick model list: the provider's suggested model first, then
// every chat model the provider reports (after "Load models"), plus
// "Other…" for typing a name that isn't listed.
function ModelSelect({
  name,
  value,
  onChange,
  suggested,
  models,
  className,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  suggested: string;
  models: string[];
  className: string;
}) {
  const [typing, setTyping] = useState(false);
  const loaded = models.filter((m) => !NOT_CHAT.test(m) && m !== suggested);
  const current = value && value !== suggested && !loaded.includes(value) ? value : null;

  if (typing) {
    return (
      <span className="flex flex-col gap-1">
        <input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Exact model name"
          autoFocus
          className={className}
        />
        <button
          type="button"
          onClick={() => setTyping(false)}
          className="self-start text-xs font-normal text-neutral-500 underline"
        >
          Back to the list
        </button>
      </span>
    );
  }

  return (
    <select
      name={name}
      value={value}
      onChange={(e) => (e.target.value === OTHER ? setTyping(true) : onChange(e.target.value))}
      className={className}
    >
      {suggested && (
        <optgroup label="Suggested">
          <option value={suggested}>{suggested}</option>
        </optgroup>
      )}
      {current && (
        <optgroup label="Saved">
          <option value={current}>{current}</option>
        </optgroup>
      )}
      {loaded.length > 0 ? (
        <optgroup label={`All models from this provider (${loaded.length})`}>
          {loaded.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </optgroup>
      ) : (
        <option disabled value="">
          Load models to see the full list
        </option>
      )}
      <option value={OTHER}>Other… (type a name)</option>
    </select>
  );
}

export type SavedSettings = {
  provider: string;
  llm_base_url: string;
  agent_model: string;
  heavy_model: string;
  llm_tool_mode: string;
  embeddings_base_url: string;
  embeddings_model: string;
  vision_base_url: string;
  vision_model: string;
  llm_api_key_hint: string | null;
  embeddings_api_key_hint: string | null;
};

// The model provider form. Picking a provider fills in its URL and suggested
// models; "Load models" asks the provider which models it really offers.
// Submits to a server action via plain named inputs.
export default function LlmSettingsForm({
  saved,
  save,
}: {
  saved: SavedSettings;
  save: (formData: FormData) => Promise<void>;
}) {
  const initial =
    providerById(saved.provider) ??
    providerForUrl(saved.llm_base_url) ??
    (saved.llm_base_url ? providerById("custom") : providerById("deepinfra"))!;

  const [provider, setProvider] = useState<Provider>(initial);
  const [baseUrl, setBaseUrl] = useState(saved.llm_base_url || initial.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [chatModel, setChatModel] = useState(saved.agent_model || initial.chatModel);
  const [heavyModel, setHeavyModel] = useState(saved.heavy_model || initial.heavyModel);
  const [toolMode, setToolMode] = useState(saved.llm_tool_mode);
  const [embBase, setEmbBase] = useState(
    saved.embeddings_base_url || (initial.embeddingsModel ? initial.baseUrl : "")
  );
  const [embModel, setEmbModel] = useState(saved.embeddings_model || initial.embeddingsModel || "");
  const [visionBase, setVisionBase] = useState(
    saved.vision_base_url || (initial.visionModel ? initial.baseUrl : "")
  );
  const [visionModel, setVisionModel] = useState(saved.vision_model || initial.visionModel || "");
  const [models, setModels] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<{ busy: boolean; msg?: string; error?: boolean }>({
    busy: false,
  });

  // A saved key belongs to the provider it was saved with; never carry it
  // over to a different one.
  const savedProviderId = saved.provider || initial.id;
  const switched = provider.id !== savedProviderId || baseUrl !== (saved.llm_base_url || initial.baseUrl);
  const keyWillBeDropped = Boolean(saved.llm_api_key_hint) && switched && !apiKey;

  function pick(id: string) {
    const p = providerById(id)!;
    setProvider(p);
    setBaseUrl(p.baseUrl);
    setChatModel(p.chatModel);
    setHeavyModel(p.heavyModel);
    setToolMode("");
    setEmbBase(p.embeddingsModel ? p.baseUrl : "");
    setEmbModel(p.embeddingsModel ?? "");
    setVisionBase(p.visionModel ? p.baseUrl : "");
    setVisionModel(p.visionModel ?? "");
    setApiKey("");
    setModels([]);
    setLoadState({ busy: false });
  }

  // With a key already saved for this provider, fetch its model list right
  // away so the lists below are ready to click.
  useEffect(() => {
    if (saved.llm_api_key_hint && !switched) void loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadModels() {
    setLoadState({ busy: true });
    try {
      const res = await fetch("/api/proxy/api/settings/llm/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ base_url: baseUrl, api_key: apiKey || undefined }),
      });
      const body = (await res.json()) as { ok?: boolean; models?: string[]; error?: string };
      if (body.ok && body.models) {
        setModels(body.models);
        setLoadState({ busy: false, msg: `${body.models.length} models found. Pick from the lists below.` });
      } else {
        setLoadState({ busy: false, error: true, msg: body.error ?? "Could not load models." });
      }
    } catch {
      setLoadState({ busy: false, error: true, msg: "Could not reach the server." });
    }
  }

  const field =
    "w-full rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2.5 font-normal outline-none transition-colors focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";
  const hint = "text-xs font-normal text-neutral-500";
  const label = "flex flex-col gap-1 text-sm font-medium";

  return (
    <form action={save} className="flex flex-col gap-4">
      <input type="hidden" name="provider" value={provider.id} />
      <input type="hidden" name="clear_llm_api_key" value={keyWillBeDropped ? "1" : ""} />

      <label className={label}>
        Provider
        <select value={provider.id} onChange={(e) => pick(e.target.value)} className={field}>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {provider.note && <span className={hint}>{provider.note}</span>}
      </label>

      <label className={label}>
        API key{!provider.needsKey && " (not needed)"}
        <input
          name="llm_api_key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          // Pasting a key and moving on loads the provider's models.
          onBlur={() => {
            if (apiKey.trim()) void loadModels();
          }}
          placeholder={
            saved.llm_api_key_hint && !switched
              ? `Saved key ${saved.llm_api_key_hint}. Paste a new one to replace it`
              : provider.needsKey
                ? "Paste your key"
                : "Leave blank"
          }
          className={field}
        />
        {provider.keyUrl && (
          <span className={hint}>
            Get one at{" "}
            <a className="underline" href={provider.keyUrl} target="_blank" rel="noreferrer">
              {new URL(provider.keyUrl).host}
            </a>
            .
          </span>
        )}
        {keyWillBeDropped && (
          <span className="text-xs font-normal text-amber-700">
            The saved key ({saved.llm_api_key_hint}) was for a different provider and will be removed on save.
          </span>
        )}
        {saved.llm_api_key_hint && !switched && (
          <span className="flex items-center gap-2 text-xs font-normal text-neutral-600">
            <input type="checkbox" name="remove_llm_api_key" /> Remove the saved key
          </span>
        )}
      </label>

      <label className={label}>
        Provider URL
        <input
          name="llm_base_url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://…/v1"
          className={field}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={loadModels}
          disabled={loadState.busy || !baseUrl}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium transition-colors hover:border-neutral-500 disabled:opacity-50"
        >
          {loadState.busy ? "Loading…" : "Load models"}
        </button>
        {loadState.msg && (
          <span className={`min-w-0 break-words text-xs ${loadState.error ? "text-red-600" : "text-green-700"}`}>
            {loadState.msg}
          </span>
        )}
      </div>

      <datalist id="provider-models">
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Chat model
          <ModelSelect
            key={`chat-${provider.id}`}
            name="agent_model"
            value={chatModel}
            onChange={setChatModel}
            suggested={provider.chatModel}
            models={models}
            className={field}
          />
          <span className={hint}>Answers questions. Must support tool calling.</span>
        </label>
        <label className={label}>
          Report model
          <ModelSelect
            key={`heavy-${provider.id}`}
            name="heavy_model"
            value={heavyModel}
            onChange={setHeavyModel}
            suggested={provider.heavyModel}
            models={models}
            className={field}
          />
          <span className={hint}>Writes report summaries. Can be the same model.</span>
        </label>
      </div>

      <details className="rounded-lg border border-neutral-200 p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Advanced: search, photos, tool calling
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <label className={label}>
            Tool calling
            <select name="llm_tool_mode" value={toolMode} onChange={(e) => setToolMode(e.target.value)} className={field}>
              <option value="">Native (most providers)</option>
              <option value="hermes-xml">Hermes XML (tools described in the prompt)</option>
            </select>
          </label>

          <p className="text-sm font-medium">Search (embeddings)</p>
          <label className={label}>
            Embeddings URL
            <input name="embeddings_base_url" value={embBase} onChange={(e) => setEmbBase(e.target.value)} placeholder="Blank: keyword search only" className={field} />
          </label>
          <label className={label}>
            Embeddings model
            <input name="embeddings_model" list="provider-models" value={embModel} onChange={(e) => setEmbModel(e.target.value)} className={field} />
            <span className={hint}>Must return 1024-dimension vectors (bge-m3, mistral-embed, text-embedding-3-small).</span>
          </label>
          <label className={label}>
            Embeddings key
            <input
              name="embeddings_api_key"
              type="password"
              autoComplete="off"
              placeholder={saved.embeddings_api_key_hint ? `Saved key ${saved.embeddings_api_key_hint}` : "Blank: reuse the API key when it is the same provider"}
              className={field}
            />
            {saved.embeddings_api_key_hint && (
              <span className="flex items-center gap-2 text-xs font-normal text-neutral-600">
                <input type="checkbox" name="remove_embeddings_api_key" /> Remove the saved embeddings key
              </span>
            )}
          </label>

          <p className="text-sm font-medium">Reading photos (vision)</p>
          <label className={label}>
            Vision URL
            <input name="vision_base_url" value={visionBase} onChange={(e) => setVisionBase(e.target.value)} placeholder="Blank: same as embeddings" className={field} />
          </label>
          <label className={label}>
            Vision model
            <input name="vision_model" list="provider-models" value={visionModel} onChange={(e) => setVisionModel(e.target.value)} placeholder="Blank: the default" className={field} />
          </label>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-stone-950 transition-colors hover:bg-stone-200"
        >
          Save
        </button>
        <TestConnectionButton />
      </div>
    </form>
  );
}

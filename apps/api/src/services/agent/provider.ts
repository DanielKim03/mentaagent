import { randomUUID } from "node:crypto";
import type OpenAI from "openai";
import { env } from "../../env.js";
import { callLLMStreaming, getChatClient } from "../llm/client.js";
import type {
  AssistantTurn,
  ChatMessage,
  NormalizedToolCall,
} from "./types.js";
import { llmConfig } from "../llm/settings.js";

// Provider adapter: one interface, three modes.
//
//   native     — OpenAI `tools` param straight through (Nebius Hermes 4).
//   hermes-xml — tool schemas embedded in the system prompt; the model emits
//                <tool_call>{"name":…,"arguments":…}</tool_call> blocks which
//                we parse out of the text; results go back wrapped in
//                <tool_response>. Format per NousResearch/Hermes-Function-
//                Calling. Makes ANY plain chat-completions host agent-capable
//                — the insurance policy against the thin Hermes hosting
//                ecosystem.
//   stub       — no LLM_API_KEY: deterministic canned turns so the entire
//                pipeline (queue → loop → tools → SSE → persistence) runs in
//                dev and tests with zero spend.

export type CompleteArgs = {
  workspaceId: string;
  operation: "agent" | "report" | "reflect";
  model: string;
  messages: ChatMessage[];
  tools: {
    type: "function";
    function: { name: string; description: string; parameters: object };
  }[];
  maxTokens: number;
  onDelta?: (text: string) => void;
};

export interface AgentProvider {
  complete(args: CompleteArgs): Promise<AssistantTurn>;
}

// --- native: OpenAI function calling ---------------------------------------

class NativeToolsProvider implements AgentProvider {
  async complete(args: CompleteArgs): Promise<AssistantTurn> {
    const { message, usage, costUsdMicros } = await callLLMStreaming({
      workspaceId: args.workspaceId,
      operation: args.operation,
      params: {
        model: args.model,
        messages: args.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools: args.tools.length > 0 ? args.tools : undefined,
        max_tokens: args.maxTokens,
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      onDelta: args.onDelta,
    });
    return {
      content: typeof message.content === "string" ? message.content : "",
      toolCalls: (message.tool_calls ?? []).flatMap((tc) =>
        tc.type === "function"
          ? [
              {
                id: tc.id,
                type: "function" as const,
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                },
              },
            ]
          : []
      ),
      usage,
      costUsdMicros,
    };
  }
}

// --- hermes-xml: schemas in prompt, <tool_call> blocks in text ---------------

const HERMES_TOOL_INSTRUCTIONS = `You have access to the following tools. To call a tool, emit exactly:
<tool_call>
{"name": "<tool name>", "arguments": {<json arguments>}}
</tool_call>
You may emit multiple tool_call blocks in one reply. Tool results arrive in <tool_response> blocks. When you have everything you need, reply with plain text and NO tool_call blocks.`;

const TOOL_CALL_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

export function parseHermesToolCalls(text: string): {
  content: string;
  toolCalls: NormalizedToolCall[];
} {
  const toolCalls: NormalizedToolCall[] = [];
  for (const match of text.matchAll(TOOL_CALL_RE)) {
    try {
      const parsed = JSON.parse(match[1]) as {
        name?: string;
        arguments?: unknown;
      };
      if (typeof parsed.name === "string") {
        toolCalls.push({
          id: `hermes_${randomUUID().slice(0, 8)}`,
          type: "function",
          function: {
            name: parsed.name,
            arguments: JSON.stringify(parsed.arguments ?? {}),
          },
        });
      }
    } catch {
      // Malformed JSON inside a tool_call block: leave it in the content so
      // the loop's error feedback path can nudge the model.
    }
  }
  const content = text.replace(TOOL_CALL_RE, "").trim();
  return { content, toolCalls };
}

class HermesXmlProvider implements AgentProvider {
  async complete(args: CompleteArgs): Promise<AssistantTurn> {
    // Convert to plain chat messages the host is guaranteed to accept:
    // tool schemas + protocol into the system prompt; tool results into
    // user-role <tool_response> blocks; assistant tool_calls back into
    // <tool_call> text (so history round-trips consistently).
    const messages: ChatMessage[] = args.messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "user" as const,
          content: `<tool_response>\n{"tool": "${m.name ?? ""}", "content": ${JSON.stringify(m.content)}}\n</tool_response>`,
        };
      }
      if (m.role === "assistant" && m.tool_calls?.length) {
        const blocks = m.tool_calls
          .map(
            (tc) =>
              `<tool_call>\n{"name": "${tc.function.name}", "arguments": ${tc.function.arguments}}\n</tool_call>`
          )
          .join("\n");
        return {
          role: "assistant" as const,
          content: [m.content, blocks].filter(Boolean).join("\n"),
        };
      }
      return { role: m.role, content: m.content };
    });

    if (args.tools.length > 0 && messages[0]?.role === "system") {
      messages[0] = {
        role: "system",
        content: `${messages[0].content}\n\n<tools>\n${JSON.stringify(
          args.tools.map((t) => t.function)
        )}\n</tools>\n\n${HERMES_TOOL_INSTRUCTIONS}`,
      };
    }

    // Don't stream raw deltas to the UI in this mode — they'd leak
    // <tool_call> wire syntax mid-stream. Text arrives on run finish.
    const { message, usage, costUsdMicros } = await callLLMStreaming({
      workspaceId: args.workspaceId,
      operation: args.operation,
      params: {
        model: args.model,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        max_tokens: args.maxTokens,
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    });

    const raw = typeof message.content === "string" ? message.content : "";
    const { content, toolCalls } = parseHermesToolCalls(raw);
    if (content && toolCalls.length === 0) args.onDelta?.(content);
    return { content, toolCalls, usage, costUsdMicros };
  }
}

// --- stub: zero-spend deterministic provider for dev/tests -------------------

type StubTurn = { content: string; toolCalls?: NormalizedToolCall[] };
let stubScript: StubTurn[] | null = null;
let stubCursor = 0;

// Tests inject a scripted sequence of turns; each complete() consumes one.
export function setStubScript(turns: StubTurn[] | null): void {
  stubScript = turns;
  stubCursor = 0;
}

class StubProvider implements AgentProvider {
  async complete(args: CompleteArgs): Promise<AssistantTurn> {
    if (stubScript) {
      const turn = stubScript[Math.min(stubCursor, stubScript.length - 1)];
      stubCursor += 1;
      if (turn.content && !turn.toolCalls?.length) args.onDelta?.(turn.content);
      return {
        content: turn.content,
        toolCalls: turn.toolCalls ?? [],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
        costUsdMicros: 0,
      };
    }
    // Default unscripted behavior, deterministic and zero-spend: first turn
    // lists documents (exercises the tool path); in report runs the second
    // turn writes the requested section (exercises the report pipeline);
    // then a final text turn.
    const toolCall = (name: string, argsJson: string) => ({
      content: "",
      toolCalls: [
        {
          id: `stub_${randomUUID().slice(0, 8)}`,
          type: "function" as const,
          function: { name, arguments: argsJson },
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
      costUsdMicros: 0,
    });

    const hasToolResult = args.messages.some(
      (m) => m.role === "tool" || m.content.startsWith("<tool_response>")
    );
    const canList = args.tools.some((t) => t.function.name === "list_documents");
    if (!hasToolResult && canList) {
      return toolCall("list_documents", "{}");
    }

    const canWriteSection = args.tools.some(
      (t) => t.function.name === "write_report_section"
    );
    const lastUser = [...args.messages].reverse().find((m) => m.role === "user");
    const sectionKey = lastUser?.content.match(/section_key: (\w+)/)?.[1];
    const sectionWritten = args.messages.some(
      (m) => m.role === "tool" && m.name === "write_report_section"
    );
    if (canWriteSection && sectionKey && !sectionWritten) {
      return toolCall(
        "write_report_section",
        JSON.stringify({
          section_key: sectionKey,
          markdown:
            "Stub section: LLM_API_KEY is not configured. This placeholder proves the report pipeline (orchestrator → loop → tools → sections) works end-to-end.",
          score: 50,
          citations: [],
        })
      );
    }

    const content = canWriteSection
      ? "SECTION COMPLETE"
      : "LLM_API_KEY is not configured, so this is a stub response. " +
        "The agent pipeline (queue, loop, tools, streaming, persistence) is working end-to-end.";
    args.onDelta?.(content);
    return {
      content,
      toolCalls: [],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
      costUsdMicros: 0,
    };
  }
}

export function getProvider(): AgentProvider {
  if (!getChatClient()) return new StubProvider();
  return llmConfig().toolMode === "hermes-xml"
    ? new HermesXmlProvider()
    : new NativeToolsProvider();
}

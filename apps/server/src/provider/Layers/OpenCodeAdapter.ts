import { pathToFileURL } from "node:url";
import type {
  AssistantMessage,
  GlobalEvent,
  Message,
  Part,
  Permission,
} from "@opencode-ai/sdk";
import {
  DEFAULT_MODEL_BY_PROVIDER,
  type CanonicalItemType,
  type CanonicalRequestType,
  type ProviderRuntimeEvent,
  type ProviderSendTurnInput,
  type ProviderSession,
  type ProviderTurnStartResult,
  type ProviderUserInputAnswers,
  EventId,
  RuntimeItemId,
  RuntimeRequestId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { trimOrNull } from "@t3tools/shared/model";
import { Effect, Layer, Queue, Stream } from "effect";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import { OpenCodeAdapter, type OpenCodeAdapterShape } from "../Services/OpenCodeAdapter.ts";
import {
  buildOpenCodeModelSlug,
  createScopedOpenCodeClient,
  openCodeErrorMessage,
  parseOpenCodeModelRef,
  parseOpenCodeServerUrl,
  startManagedOpenCodeServer,
  trimToUndefined,
} from "../opencodeServer";

const PROVIDER = "opencode" as const;
const SERVER_THREAD_ID = ThreadId.makeUnsafe("opencode-server");

interface RunningOpenCodeServer {
  readonly signature: string;
  readonly baseUrl: string;
  readonly authToken: string | undefined;
  readonly closeServer: () => void;
  readonly eventsAbortController: AbortController;
}

interface OpenCodeItemState {
  readonly itemId: RuntimeItemId;
  readonly itemType: CanonicalItemType;
  readonly streamKind: "assistant_text" | "reasoning_text" | undefined;
  title: string | undefined;
  text: string;
  completed: boolean;
}

interface OpenCodeTurnState {
  readonly turnId: TurnId;
  readonly startedAt: string;
  readonly model: string;
  assistantMessageId: string | undefined;
  readonly itemsByPartId: Map<string, OpenCodeItemState>;
  interrupted: boolean;
  completionSent: boolean;
}

interface OpenCodeSessionContext {
  session: ProviderSession;
  readonly openCodeSessionId: string;
  readonly cwd: string;
  readonly defaultAgent: string | undefined;
  readonly messageRoleById: Map<string, Message["role"]>;
  readonly pendingApprovals: Map<string, CanonicalRequestType>;
  activeTurn: OpenCodeTurnState | undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function nextEventId(tag: string): EventId {
  return EventId.makeUnsafe(`opencode-${tag}-${crypto.randomUUID()}`);
}

function nextItemId(tag: string): RuntimeItemId {
  return RuntimeItemId.makeUnsafe(`opencode-item-${tag}-${crypto.randomUUID()}`);
}

function buildResumeCursor(sessionId: string): { sessionId: string } {
  return { sessionId };
}

function sessionSettingsSignature(input: {
  readonly serverUrl: string;
  readonly authToken: string;
  readonly autoStartServer: boolean;
  readonly binaryPath: string;
  readonly configPath: string;
}): string {
  return [
    input.serverUrl,
    input.authToken,
    input.autoStartServer ? "autostart" : "manual",
    input.binaryPath,
    input.configPath,
  ].join("\u0000");
}

function toSessionError(threadId: ThreadId, cause: unknown): ProviderAdapterSessionNotFoundError {
  return new ProviderAdapterSessionNotFoundError({
    provider: PROVIDER,
    threadId,
    cause,
  });
}

function toProcessError(threadId: ThreadId, detail: string, cause: unknown): ProviderAdapterProcessError {
  return new ProviderAdapterProcessError({
    provider: PROVIDER,
    threadId,
    detail,
    cause,
  });
}

function toRequestError(
  method: string,
  cause: unknown,
): ProviderAdapterRequestError {
  return new ProviderAdapterRequestError({
    provider: PROVIDER,
    method,
    detail: openCodeErrorMessage(cause),
    cause,
  });
}

function requestTypeFromPermission(permission: Permission): CanonicalRequestType {
  const signal = `${permission.type} ${permission.title}`.toLowerCase();
  if (signal.includes("bash") || signal.includes("command") || signal.includes("shell")) {
    return "command_execution_approval";
  }
  if (signal.includes("read")) {
    return "file_read_approval";
  }
  if (
    signal.includes("edit") ||
    signal.includes("write") ||
    signal.includes("patch") ||
    signal.includes("delete") ||
    signal.includes("create")
  ) {
    return "file_change_approval";
  }
  return "unknown";
}

function itemTypeFromToolName(toolName: string): CanonicalItemType {
  const normalized = toolName.toLowerCase();
  if (normalized.includes("bash") || normalized.includes("command") || normalized.includes("shell")) {
    return "command_execution";
  }
  if (
    normalized.includes("edit") ||
    normalized.includes("patch") ||
    normalized.includes("write") ||
    normalized.includes("replace")
  ) {
    return "file_change";
  }
  if (normalized.includes("web")) {
    return "web_search";
  }
  if (normalized.includes("image")) {
    return "image_view";
  }
  return "dynamic_tool_call";
}

function tokenUsageFromAssistantMessage(message: AssistantMessage) {
  const inputTokens = message.tokens?.input ?? 0;
  const outputTokens = message.tokens?.output ?? 0;
  const reasoningOutputTokens = message.tokens?.reasoning ?? 0;
  const usedTokens = inputTokens + outputTokens + reasoningOutputTokens;
  if (usedTokens <= 0) {
    return undefined;
  }
  return {
    usedTokens,
    inputTokens,
    outputTokens,
    reasoningOutputTokens,
    lastUsedTokens: usedTokens,
    lastInputTokens: inputTokens,
    lastOutputTokens: outputTokens,
    lastReasoningOutputTokens: reasoningOutputTokens,
  };
}

function sessionIdFromGlobalEvent(event: GlobalEvent): string | undefined {
  switch (event.payload.type) {
    case "message.updated":
      return event.payload.properties.info.sessionID;
    case "message.removed":
      return event.payload.properties.sessionID;
    case "message.part.updated":
      return event.payload.properties.part.sessionID;
    case "message.part.removed":
      return event.payload.properties.sessionID;
    case "permission.updated":
      return event.payload.properties.sessionID;
    case "permission.replied":
      return event.payload.properties.sessionID;
    case "session.status":
      return event.payload.properties.sessionID;
    case "session.idle":
      return event.payload.properties.sessionID;
    case "session.compacted":
      return event.payload.properties.sessionID;
    case "todo.updated":
      return event.payload.properties.sessionID;
    case "command.executed":
      return event.payload.properties.sessionID;
    case "session.created":
    case "session.updated":
    case "session.deleted":
      return event.payload.properties.info.id;
    case "session.diff":
      return event.payload.properties.sessionID;
    case "session.error":
      return event.payload.properties.sessionID;
    default:
      return undefined;
  }
}

function promptTextDelta(previousText: string, nextText: string, explicitDelta?: string): string | undefined {
  const normalizedExplicitDelta = trimToUndefined(explicitDelta);
  if (normalizedExplicitDelta) {
    return normalizedExplicitDelta;
  }
  if (nextText.startsWith(previousText)) {
    const delta = nextText.slice(previousText.length);
    return delta.length > 0 ? delta : undefined;
  }
  return nextText.length > 0 ? nextText : undefined;
}

function toolStateTitle(part: Extract<Part, { type: "tool" }>): string {
  const title =
    "title" in part.state && typeof part.state.title === "string" ? trimToUndefined(part.state.title) : undefined;
  return title ?? part.tool;
}

function toolStateDetail(part: Extract<Part, { type: "tool" }>): string | undefined {
  if ("output" in part.state && typeof part.state.output === "string") {
    return trimOrNull(part.state.output) ?? undefined;
  }
  if ("error" in part.state && typeof part.state.error === "string") {
    return trimOrNull(part.state.error) ?? undefined;
  }
  if ("raw" in part.state && typeof part.state.raw === "string") {
    return trimOrNull(part.state.raw) ?? undefined;
  }
  return undefined;
}

function buildPromptParts(input: {
  readonly turnInput: ProviderSendTurnInput;
  readonly attachmentsDir: string;
}): Array<
  | {
      type: "text";
      text: string;
    }
  | {
      type: "file";
      mime: string;
      filename?: string;
      url: string;
    }
> {
  const parts: Array<
    | {
        type: "text";
        text: string;
      }
    | {
        type: "file";
        mime: string;
        filename?: string;
        url: string;
      }
  > = [];

  const text = trimToUndefined(input.turnInput.input);
  if (text) {
    parts.push({ type: "text", text });
  }

  for (const attachment of input.turnInput.attachments ?? []) {
    const attachmentPath = resolveAttachmentPath({
      attachmentsDir: input.attachmentsDir,
      attachment,
    });
    if (!attachmentPath) {
      continue;
    }
    parts.push({
      type: "file",
      mime: attachment.mimeType,
      filename: attachment.name,
      url: pathToFileURL(attachmentPath).toString(),
    });
  }

  return parts;
}

function updateContextSession(
  context: OpenCodeSessionContext,
  patch: {
    readonly status?: ProviderSession["status"];
    readonly updatedAt?: string;
    readonly model?: string | null;
    readonly activeTurnId?: TurnId | null;
    readonly lastError?: string | null;
  },
): void {
  const model = patch.model === null ? undefined : patch.model ?? context.session.model;
  const activeTurnId =
    patch.activeTurnId === null ? undefined : patch.activeTurnId ?? context.session.activeTurnId;
  const lastError =
    patch.lastError === null ? undefined : patch.lastError ?? context.session.lastError;

  context.session = {
    provider: context.session.provider,
    status: patch.status ?? context.session.status,
    runtimeMode: context.session.runtimeMode,
    threadId: context.session.threadId,
    createdAt: context.session.createdAt,
    updatedAt: patch.updatedAt ?? context.session.updatedAt,
    ...(context.session.cwd ? { cwd: context.session.cwd } : {}),
    ...(model ? { model } : {}),
    ...(context.session.resumeCursor !== undefined
      ? { resumeCursor: context.session.resumeCursor }
      : {}),
    ...(activeTurnId ? { activeTurnId } : {}),
    ...(lastError ? { lastError } : {}),
  };
}

export const makeOpenCodeAdapter = Effect.gen(function* () {
  const serverConfig = yield* ServerConfig;
  const settingsService = yield* ServerSettingsService;
  const runtimeEventQueue = yield* Queue.unbounded<ProviderRuntimeEvent>();
  const services = yield* Effect.services();
  const runFork = Effect.runForkWith(services);
  const runPromise = Effect.runPromiseWith(services);
  const sessions = new Map<ThreadId, OpenCodeSessionContext>();
  const threadIdByOpenCodeSessionId = new Map<string, ThreadId>();
  let runningServer: RunningOpenCodeServer | null = null;

  const offerRuntimeEvent = (event: ProviderRuntimeEvent) =>
    Queue.offer(runtimeEventQueue, event).pipe(Effect.asVoid);

  const getOpenCodeSettings = (threadId: ThreadId = SERVER_THREAD_ID) =>
    settingsService.getSettings.pipe(
      Effect.map((settings) => settings.providers.opencode),
      Effect.mapError((cause) =>
        toProcessError(threadId, `Failed to load OpenCode settings: ${cause.message}`, cause),
      ),
    );

  const stopRunningServer = (): void => {
    if (!runningServer) {
      return;
    }
    runningServer.eventsAbortController.abort();
    runningServer.closeServer();
    runningServer = null;
  };

  const resolveContext = (threadId: ThreadId): Effect.Effect<OpenCodeSessionContext, ProviderAdapterError> => {
    const context = sessions.get(threadId);
    return context ? Effect.succeed(context) : Effect.fail(toSessionError(threadId, "Unknown thread"));
  };

  const fetchSessionMessage = (
    context: OpenCodeSessionContext,
    baseUrl: string,
    authToken: string | undefined,
    messageId: string,
  ) =>
    Effect.tryPromise({
      try: async () => {
        const client = createScopedOpenCodeClient(baseUrl, context.cwd, authToken);
        const response = await client.session.message({
          path: {
            id: context.openCodeSessionId,
            messageID: messageId,
          },
        });
        if (!response.data) {
          throw new Error("OpenCode returned no message details.");
        }
        return response.data;
      },
      catch: (cause) => toRequestError("session.message", cause),
    });

  const completeOpenItem = (
    context: OpenCodeSessionContext,
    itemState: OpenCodeItemState,
    detail: string | undefined,
  ) =>
    Effect.gen(function* () {
      if (!context.activeTurn || itemState.completed) {
        return;
      }
      itemState.completed = true;
      yield* offerRuntimeEvent({
        type: "item.completed",
        eventId: nextEventId("item-completed"),
        provider: PROVIDER,
        threadId: context.session.threadId,
        createdAt: nowIso(),
        turnId: context.activeTurn.turnId,
        itemId: itemState.itemId,
        payload: {
          itemType: itemState.itemType,
          status: "completed",
          ...(itemState.title ? { title: itemState.title } : {}),
          ...(detail ? { detail } : {}),
        },
      });
    });

  const syncTextPart = (
    context: OpenCodeSessionContext,
    part: Extract<Part, { type: "text" | "reasoning" }>,
    delta?: string,
  ) =>
    Effect.gen(function* () {
      if (!context.activeTurn) {
        return;
      }
      const itemType: CanonicalItemType = part.type === "reasoning" ? "reasoning" : "assistant_message";
      const streamKind = part.type === "reasoning" ? "reasoning_text" : "assistant_text";
      let itemState = context.activeTurn.itemsByPartId.get(part.id);
      if (!itemState) {
        itemState = {
          itemId: nextItemId(part.type),
          itemType,
          streamKind,
          title: itemType === "reasoning" ? "Reasoning" : "Assistant message",
          text: "",
          completed: false,
        };
        context.activeTurn.itemsByPartId.set(part.id, itemState);
        yield* offerRuntimeEvent({
          type: "item.started",
          eventId: nextEventId("item-started"),
          provider: PROVIDER,
          threadId: context.session.threadId,
          createdAt: nowIso(),
          turnId: context.activeTurn.turnId,
          itemId: itemState.itemId,
          payload: {
            itemType,
            ...(itemState.title ? { title: itemState.title } : {}),
          },
        });
      }

      const nextText = part.text;
      const textDelta = promptTextDelta(itemState.text, nextText, delta);
      itemState.text = nextText;
      if (textDelta) {
        yield* offerRuntimeEvent({
          type: "content.delta",
          eventId: nextEventId("content-delta"),
          provider: PROVIDER,
          threadId: context.session.threadId,
          createdAt: nowIso(),
          turnId: context.activeTurn.turnId,
          itemId: itemState.itemId,
          payload: {
            streamKind,
            delta: textDelta,
          },
        });
      }

      const hasEnded =
        "time" in part &&
        !!part.time &&
        typeof part.time === "object" &&
        "end" in part.time &&
        typeof part.time.end === "number";
      if (hasEnded) {
        yield* completeOpenItem(context, itemState, trimOrNull(itemState.text) ?? undefined);
      }
    });

  const syncToolPart = (
    context: OpenCodeSessionContext,
    part: Extract<Part, { type: "tool" }>,
  ) =>
    Effect.gen(function* () {
      if (!context.activeTurn) {
        return;
      }
      let itemState = context.activeTurn.itemsByPartId.get(part.id);
      if (!itemState) {
        itemState = {
          itemId: nextItemId("tool"),
          itemType: itemTypeFromToolName(part.tool),
          streamKind: undefined,
          title: toolStateTitle(part),
          text: "",
          completed: false,
        };
        context.activeTurn.itemsByPartId.set(part.id, itemState);
        yield* offerRuntimeEvent({
          type: "item.started",
          eventId: nextEventId("tool-started"),
          provider: PROVIDER,
          threadId: context.session.threadId,
          createdAt: nowIso(),
          turnId: context.activeTurn.turnId,
          itemId: itemState.itemId,
          payload: {
            itemType: itemState.itemType,
            ...(itemState.title ? { title: itemState.title } : {}),
          },
        });
      } else {
        itemState.title = toolStateTitle(part);
      }

      if (part.state.status === "completed" || part.state.status === "error") {
        if (itemState.completed) {
          return;
        }
        itemState.completed = true;
        yield* offerRuntimeEvent({
          type: "item.completed",
          eventId: nextEventId("tool-completed"),
          provider: PROVIDER,
          threadId: context.session.threadId,
          createdAt: nowIso(),
          turnId: context.activeTurn.turnId,
          itemId: itemState.itemId,
          payload: {
            itemType: itemState.itemType,
            status: part.state.status === "error" ? "failed" : "completed",
            ...(itemState.title ? { title: itemState.title } : {}),
            ...(toolStateDetail(part) ? { detail: toolStateDetail(part) } : {}),
            data: {
              tool: part.tool,
              state: part.state,
            },
          },
        });
      }
    });

  const syncPatchPart = (
    context: OpenCodeSessionContext,
    part: Extract<Part, { type: "patch" }>,
  ) =>
    Effect.gen(function* () {
      if (!context.activeTurn || context.activeTurn.itemsByPartId.has(part.id)) {
        return;
      }
      const itemState: OpenCodeItemState = {
        itemId: nextItemId("patch"),
        itemType: "file_change",
        streamKind: undefined,
        title: "Applied patch",
        text: part.files.join(", "),
        completed: true,
      };
      context.activeTurn.itemsByPartId.set(part.id, itemState);
      yield* offerRuntimeEvent({
        type: "item.completed",
        eventId: nextEventId("patch-completed"),
        provider: PROVIDER,
        threadId: context.session.threadId,
        createdAt: nowIso(),
        turnId: context.activeTurn.turnId,
        itemId: itemState.itemId,
        payload: {
          itemType: itemState.itemType,
          status: "completed",
          title: itemState.title,
          ...(trimOrNull(itemState.text) ? { detail: trimOrNull(itemState.text)! } : {}),
          data: { files: part.files, hash: part.hash },
        },
      });
    });

  const syncAgentLikePart = (
    context: OpenCodeSessionContext,
    part: Extract<Part, { type: "subtask" | "agent" }>,
  ) =>
    Effect.gen(function* () {
      if (!context.activeTurn || context.activeTurn.itemsByPartId.has(part.id)) {
        return;
      }
      const itemState: OpenCodeItemState = {
        itemId: nextItemId(part.type),
        itemType: "collab_agent_tool_call",
        streamKind: undefined,
        title: part.type === "subtask" ? part.description : part.name,
        text: part.type === "subtask" ? part.prompt : "",
        completed: true,
      };
      context.activeTurn.itemsByPartId.set(part.id, itemState);
      yield* offerRuntimeEvent({
        type: "item.completed",
        eventId: nextEventId("agent-completed"),
        provider: PROVIDER,
        threadId: context.session.threadId,
        createdAt: nowIso(),
        turnId: context.activeTurn.turnId,
        itemId: itemState.itemId,
        payload: {
          itemType: itemState.itemType,
          status: "completed",
          ...(itemState.title ? { title: itemState.title } : {}),
          ...(trimOrNull(itemState.text) ? { detail: trimOrNull(itemState.text)! } : {}),
        },
      });
    });

  const syncPart = (context: OpenCodeSessionContext, part: Part, delta?: string) =>
    Effect.gen(function* () {
      switch (part.type) {
        case "text":
        case "reasoning":
          yield* syncTextPart(context, part, delta);
          break;
        case "tool":
          yield* syncToolPart(context, part);
          break;
        case "patch":
          yield* syncPatchPart(context, part);
          break;
        case "subtask":
        case "agent":
          yield* syncAgentLikePart(context, part);
          break;
        default:
          break;
      }
    });

  const finalizeAssistantTurn = (
    context: OpenCodeSessionContext,
    message: AssistantMessage,
    parts: ReadonlyArray<Part>,
  ) =>
    Effect.gen(function* () {
      if (!context.activeTurn || context.activeTurn.completionSent) {
        return;
      }

      for (const part of parts) {
        yield* syncPart(context, part);
      }

      for (const itemState of context.activeTurn.itemsByPartId.values()) {
        if (!itemState.completed) {
          yield* completeOpenItem(context, itemState, trimOrNull(itemState.text) ?? undefined);
        }
      }

      const usage = tokenUsageFromAssistantMessage(message);
      if (usage) {
        yield* offerRuntimeEvent({
          type: "thread.token-usage.updated",
          eventId: nextEventId("token-usage"),
          provider: PROVIDER,
          threadId: context.session.threadId,
          createdAt: nowIso(),
          turnId: context.activeTurn.turnId,
          payload: {
            usage,
          },
        });
      }

      yield* offerRuntimeEvent({
        type: "turn.completed",
        eventId: nextEventId("turn-completed"),
        provider: PROVIDER,
        threadId: context.session.threadId,
        createdAt: nowIso(),
        turnId: context.activeTurn.turnId,
        payload: {
          state: context.activeTurn.interrupted ? "interrupted" : "completed",
          ...(trimOrNull(message.finish) ? { stopReason: trimOrNull(message.finish)! } : {}),
        },
      });
      yield* offerRuntimeEvent({
        type: "session.state.changed",
        eventId: nextEventId("session-ready"),
        provider: PROVIDER,
        threadId: context.session.threadId,
        createdAt: nowIso(),
        payload: {
          state: context.activeTurn.interrupted ? "stopped" : "ready",
        },
      });

      updateContextSession(context, {
        status: "ready",
        updatedAt: nowIso(),
        activeTurnId: null,
        lastError: null,
      });
      context.activeTurn.completionSent = true;
      context.activeTurn = undefined;
    });

  const handleGlobalEvent = (
    globalEvent: GlobalEvent,
    baseUrl: string,
    authToken: string | undefined,
  ) =>
    Effect.gen(function* () {
      const sessionId = sessionIdFromGlobalEvent(globalEvent);
      if (!sessionId) {
        return;
      }
      const threadId = threadIdByOpenCodeSessionId.get(sessionId);
      if (!threadId) {
        return;
      }
      const context = sessions.get(threadId);
      if (!context) {
        return;
      }

      switch (globalEvent.payload.type) {
        case "session.status": {
          const status = globalEvent.payload.properties.status;
          yield* offerRuntimeEvent({
            type: "session.state.changed",
            eventId: nextEventId("session-state"),
            provider: PROVIDER,
            threadId: context.session.threadId,
            createdAt: nowIso(),
            payload: {
              state:
                status.type === "busy" ? "running" : status.type === "retry" ? "waiting" : "ready",
              ...(status.type === "retry" ? { reason: status.message } : {}),
            },
          });
          break;
        }

        case "session.idle": {
          yield* offerRuntimeEvent({
            type: "session.state.changed",
            eventId: nextEventId("session-idle"),
            provider: PROVIDER,
            threadId: context.session.threadId,
            createdAt: nowIso(),
            payload: {
              state: "ready",
            },
          });
          break;
        }

        case "session.error": {
          const message =
            globalEvent.payload.properties.error &&
            "data" in globalEvent.payload.properties.error &&
            globalEvent.payload.properties.error.data &&
            typeof globalEvent.payload.properties.error.data.message === "string"
              ? globalEvent.payload.properties.error.data.message
              : "OpenCode session error.";
          if (context.activeTurn && !context.activeTurn.completionSent) {
            yield* offerRuntimeEvent({
              type: "turn.completed",
              eventId: nextEventId("turn-failed"),
              provider: PROVIDER,
              threadId: context.session.threadId,
              createdAt: nowIso(),
              turnId: context.activeTurn.turnId,
              payload: {
                state: context.activeTurn.interrupted ? "interrupted" : "failed",
                errorMessage: message,
              },
            });
            context.activeTurn.completionSent = true;
            context.activeTurn = undefined;
          }
          updateContextSession(context, {
            status: "error",
            updatedAt: nowIso(),
            activeTurnId: null,
            lastError: message,
          });
          yield* offerRuntimeEvent({
            type: "runtime.error",
            eventId: nextEventId("runtime-error"),
            provider: PROVIDER,
            threadId: context.session.threadId,
            createdAt: nowIso(),
            payload: {
              message,
            },
          });
          break;
        }

        case "permission.updated": {
          const requestType = requestTypeFromPermission(globalEvent.payload.properties);
          context.pendingApprovals.set(globalEvent.payload.properties.id, requestType);
          yield* offerRuntimeEvent({
            type: "request.opened",
            eventId: nextEventId("request-opened"),
            provider: PROVIDER,
            threadId: context.session.threadId,
            createdAt: nowIso(),
            turnId: context.activeTurn?.turnId,
            requestId: RuntimeRequestId.makeUnsafe(globalEvent.payload.properties.id),
            payload: {
              requestType,
              ...(trimOrNull(globalEvent.payload.properties.title)
                ? { detail: trimOrNull(globalEvent.payload.properties.title)! }
                : {}),
              args: globalEvent.payload.properties.metadata,
            },
          });
          break;
        }

        case "permission.replied": {
          const requestType =
            context.pendingApprovals.get(globalEvent.payload.properties.permissionID) ?? "unknown";
          context.pendingApprovals.delete(globalEvent.payload.properties.permissionID);
          yield* offerRuntimeEvent({
            type: "request.resolved",
            eventId: nextEventId("request-resolved"),
            provider: PROVIDER,
            threadId: context.session.threadId,
            createdAt: nowIso(),
            turnId: context.activeTurn?.turnId,
            requestId: RuntimeRequestId.makeUnsafe(globalEvent.payload.properties.permissionID),
            payload: {
              requestType,
              ...(trimOrNull(globalEvent.payload.properties.response)
                ? { decision: trimOrNull(globalEvent.payload.properties.response)! }
                : {}),
            },
          });
          break;
        }

        case "message.updated": {
          const message = globalEvent.payload.properties.info;
          context.messageRoleById.set(message.id, message.role);
          if (message.role !== "assistant" || !context.activeTurn) {
            return;
          }
          context.activeTurn.assistantMessageId = message.id;
          if (message.time.completed) {
            const fullMessage = yield* fetchSessionMessage(context, baseUrl, authToken, message.id);
            if (fullMessage.info.role === "assistant") {
              yield* finalizeAssistantTurn(context, fullMessage.info, fullMessage.parts);
            }
          }
          break;
        }

        case "message.part.updated": {
          if (!context.activeTurn) {
            return;
          }
          const part = globalEvent.payload.properties.part;
          let role = context.messageRoleById.get(part.messageID);
          if (!role) {
            const fullMessage = yield* fetchSessionMessage(
              context,
              baseUrl,
              authToken,
              part.messageID,
            );
            role = fullMessage.info.role;
            context.messageRoleById.set(part.messageID, role);
          }
          if (role !== "assistant") {
            return;
          }
          context.activeTurn.assistantMessageId = part.messageID;
          yield* syncPart(context, part, globalEvent.payload.properties.delta);
          break;
        }

        default:
          break;
      }
    });

  const ensureServer = (threadId: ThreadId = SERVER_THREAD_ID): Effect.Effect<RunningOpenCodeServer, ProviderAdapterError> =>
    Effect.gen(function* () {
      const settings = yield* getOpenCodeSettings(threadId);
      const configuredServer = parseOpenCodeServerUrl(settings.serverUrl);
      if (configuredServer && "error" in configuredServer) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "startSession",
          issue: configuredServer.error,
        });
      }

      const authToken = trimToUndefined(settings.authToken);
      const signature = sessionSettingsSignature({
        serverUrl: configuredServer && "baseUrl" in configuredServer ? configuredServer.baseUrl : "",
        authToken: authToken ?? "",
        autoStartServer: settings.autoStartServer,
        binaryPath: settings.binaryPath,
        configPath: settings.configPath,
      });
      if (runningServer?.signature === signature) {
        return runningServer;
      }

      stopRunningServer();
      if (configuredServer && "baseUrl" in configuredServer) {
        const nextRunningServer: RunningOpenCodeServer = {
          signature,
          baseUrl: configuredServer.baseUrl,
          authToken,
          closeServer: () => {},
          eventsAbortController: new AbortController(),
        };
        runningServer = nextRunningServer;

        const eventListener = Effect.tryPromise({
          try: async () => {
            const client = createScopedOpenCodeClient(
              nextRunningServer.baseUrl,
              undefined,
              nextRunningServer.authToken,
            );
            const events = await client.global.event({
              signal: nextRunningServer.eventsAbortController.signal,
            });
            for await (const globalEvent of events.stream as AsyncIterable<GlobalEvent>) {
              await runPromise(
                handleGlobalEvent(
                  globalEvent,
                  nextRunningServer.baseUrl,
                  nextRunningServer.authToken,
                ).pipe(Effect.catch((error) => Effect.logError(error))),
              );
            }
          },
          catch: (cause) =>
            toProcessError(
              threadId,
              `OpenCode event stream failed: ${openCodeErrorMessage(cause)}`,
              cause,
            ),
        }).pipe(
          Effect.catch((cause) => {
            if (nextRunningServer.eventsAbortController.signal.aborted) {
              return Effect.void;
            }
            return Effect.logError(`OpenCode event stream failed: ${openCodeErrorMessage(cause)}`);
          }),
          Effect.asVoid,
        );
        runFork(eventListener);

        return nextRunningServer;
      }

      if (!settings.autoStartServer) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "startSession",
          issue:
            "Set an OpenCode server URL or enable automatic local OpenCode startup in Settings.",
        });
      }

      const server = yield* Effect.tryPromise({
        try: async () =>
          startManagedOpenCodeServer({
            binaryPath: settings.binaryPath,
            ...(trimToUndefined(settings.configPath)
              ? { configPath: trimToUndefined(settings.configPath)! }
              : {}),
            cwd: serverConfig.cwd,
            timeoutMs: 8_000,
          }),
        catch: (cause) =>
          toProcessError(threadId, `Failed to start OpenCode server: ${openCodeErrorMessage(cause)}`, cause),
      });

      const nextRunningServer: RunningOpenCodeServer = {
        signature,
        baseUrl: server.baseUrl,
        authToken,
        closeServer: () => server.close(),
        eventsAbortController: new AbortController(),
      };
      runningServer = nextRunningServer;

      const eventListener = Effect.tryPromise({
        try: async () => {
          const client = createScopedOpenCodeClient(
            nextRunningServer.baseUrl,
            undefined,
            nextRunningServer.authToken,
          );
          const events = await client.global.event({
            signal: nextRunningServer.eventsAbortController.signal,
          });
          for await (const globalEvent of events.stream as AsyncIterable<GlobalEvent>) {
            await runPromise(
              handleGlobalEvent(
                globalEvent,
                nextRunningServer.baseUrl,
                nextRunningServer.authToken,
              ).pipe(Effect.catch((error) => Effect.logError(error))),
            );
          }
        },
        catch: (cause) =>
          toProcessError(
            threadId,
            `OpenCode event stream failed: ${openCodeErrorMessage(cause)}`,
            cause,
          ),
      }).pipe(
        Effect.catch((cause) => {
          if (nextRunningServer.eventsAbortController.signal.aborted) {
            return Effect.void;
          }
          return Effect.logError(
            `OpenCode event stream failed: ${openCodeErrorMessage(cause)}`,
          );
        }),
        Effect.asVoid,
      );
      runFork(eventListener);

      return nextRunningServer;
    });

  const startSession: OpenCodeAdapterShape["startSession"] = (input) =>
    Effect.gen(function* () {
      if (input.provider !== undefined && input.provider !== PROVIDER) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "startSession",
          issue: `Expected provider '${PROVIDER}' but received '${input.provider}'.`,
        });
      }
      if (input.modelSelection?.provider && input.modelSelection.provider !== PROVIDER) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "startSession",
          issue: `Expected model selection provider '${PROVIDER}' but received '${input.modelSelection.provider}'.`,
        });
      }

      const settings = yield* getOpenCodeSettings(input.threadId);
      const server = yield* ensureServer(input.threadId);
      const cwd = trimToUndefined(input.cwd) ?? serverConfig.cwd;
      const client = createScopedOpenCodeClient(server.baseUrl, cwd, server.authToken);
      const resumeSessionId =
        input.resumeCursor &&
        typeof input.resumeCursor === "object" &&
        "sessionId" in input.resumeCursor &&
        typeof input.resumeCursor.sessionId === "string"
          ? input.resumeCursor.sessionId
          : undefined;

      let openCodeSessionId = resumeSessionId;
      if (openCodeSessionId) {
        const existing = yield* Effect.tryPromise({
          try: async () =>
            client.session.get({
              path: { id: openCodeSessionId! },
            }),
          catch: (cause) => toRequestError("session.get", cause),
        }).pipe(Effect.catch(() => Effect.void));
        if (!existing?.data?.id) {
          openCodeSessionId = undefined;
        }
      }

      if (!openCodeSessionId) {
        const created = yield* Effect.tryPromise({
          try: async () =>
            client.session.create({
              body: {
                title: `Cut2Kit ${String(input.threadId)}`,
              },
            }),
          catch: (cause) => toRequestError("session.create", cause),
        });
        if (!created.data?.id) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "session.create",
            detail: "OpenCode did not return a session id.",
          });
        }
        openCodeSessionId = created.data.id;
      }

      const startedAt = nowIso();
      const modelSelection = input.modelSelection?.provider === PROVIDER ? input.modelSelection : undefined;
      const session: ProviderSession = {
        provider: PROVIDER,
        status: "ready",
        runtimeMode: input.runtimeMode,
        threadId: input.threadId,
        cwd,
        ...(modelSelection ? { model: modelSelection.model } : {}),
        resumeCursor: buildResumeCursor(openCodeSessionId),
        createdAt: startedAt,
        updatedAt: startedAt,
      };

      const context: OpenCodeSessionContext = {
        session,
        openCodeSessionId,
        cwd,
        defaultAgent: trimToUndefined(settings.defaultAgent),
        messageRoleById: new Map(),
        pendingApprovals: new Map(),
        activeTurn: undefined,
      };
      sessions.set(input.threadId, context);
      threadIdByOpenCodeSessionId.set(openCodeSessionId, input.threadId);

      yield* offerRuntimeEvent({
        type: "session.started",
        eventId: nextEventId("session-started"),
        provider: PROVIDER,
        threadId: input.threadId,
        createdAt: startedAt,
        payload: {
          resume: buildResumeCursor(openCodeSessionId),
        },
      });
      yield* offerRuntimeEvent({
        type: "session.configured",
        eventId: nextEventId("session-configured"),
        provider: PROVIDER,
        threadId: input.threadId,
        createdAt: startedAt,
        payload: {
          config: {
            cwd,
            sessionId: openCodeSessionId,
            ...(context.defaultAgent ? { agent: context.defaultAgent } : {}),
          },
        },
      });
      yield* offerRuntimeEvent({
        type: "session.state.changed",
        eventId: nextEventId("session-ready"),
        provider: PROVIDER,
        threadId: input.threadId,
        createdAt: startedAt,
        payload: {
          state: "ready",
        },
      });
      yield* offerRuntimeEvent({
        type: "thread.started",
        eventId: nextEventId("thread-started"),
        provider: PROVIDER,
        threadId: input.threadId,
        createdAt: startedAt,
        payload: {
          providerThreadId: openCodeSessionId,
        },
      });

      return session;
    });

  const sendTurn: OpenCodeAdapterShape["sendTurn"] = (input) =>
    Effect.gen(function* () {
      const context = yield* resolveContext(input.threadId);
      if (context.activeTurn) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "sendTurn",
          issue: "An OpenCode turn is already in progress for this thread.",
        });
      }

      const server = yield* ensureServer(input.threadId);
      const client = createScopedOpenCodeClient(server.baseUrl, context.cwd, server.authToken);
      const turnId = TurnId.makeUnsafe(`opencode-turn-${crypto.randomUUID()}`);
      const modelSelection =
        input.modelSelection?.provider === PROVIDER
          ? input.modelSelection
          : {
              provider: PROVIDER,
              model: context.session.model ?? DEFAULT_MODEL_BY_PROVIDER.opencode,
            };
      const modelRef = parseOpenCodeModelRef(modelSelection.model);
      if (!modelRef) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "sendTurn",
          issue: `OpenCode models must use provider/model format. Received '${modelSelection.model}'.`,
        });
      }

      const parts = buildPromptParts({
        turnInput: input,
        attachmentsDir: serverConfig.attachmentsDir,
      });
      if (parts.length === 0) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "sendTurn",
          issue: "OpenCode turns require text or attachments.",
        });
      }

      const startedAt = nowIso();
      context.activeTurn = {
        turnId,
        startedAt,
        model: buildOpenCodeModelSlug(modelRef.providerID, modelRef.modelID),
        assistantMessageId: undefined,
        itemsByPartId: new Map(),
        interrupted: false,
        completionSent: false,
      };
      updateContextSession(context, {
        status: "running",
        updatedAt: startedAt,
        activeTurnId: turnId,
        model: context.activeTurn.model,
        lastError: null,
      });

      yield* offerRuntimeEvent({
        type: "session.state.changed",
        eventId: nextEventId("session-running"),
        provider: PROVIDER,
        threadId: input.threadId,
        createdAt: startedAt,
        turnId,
        payload: {
          state: "running",
        },
      });
      yield* offerRuntimeEvent({
        type: "turn.started",
        eventId: nextEventId("turn-started"),
        provider: PROVIDER,
        threadId: input.threadId,
        createdAt: startedAt,
        turnId,
        payload: {
          model: context.activeTurn.model,
        },
      });

      yield* Effect.tryPromise({
        try: async () =>
          client.session.promptAsync({
            path: { id: context.openCodeSessionId },
            body: {
              model: modelRef,
              ...(context.defaultAgent ? { agent: context.defaultAgent } : {}),
              parts,
            },
          }),
        catch: (cause) => toRequestError("session.promptAsync", cause),
      });

      return {
        threadId: input.threadId,
        turnId,
        resumeCursor: buildResumeCursor(context.openCodeSessionId),
      } satisfies ProviderTurnStartResult;
    });

  const interruptTurn: OpenCodeAdapterShape["interruptTurn"] = (threadId) =>
    Effect.gen(function* () {
      const context = yield* resolveContext(threadId);
      if (context.activeTurn) {
        context.activeTurn.interrupted = true;
      }
      const server = yield* ensureServer(threadId);
      const client = createScopedOpenCodeClient(server.baseUrl, context.cwd, server.authToken);
      yield* Effect.tryPromise({
        try: async () =>
          client.session.abort({
            path: { id: context.openCodeSessionId },
          }),
        catch: (cause) => toRequestError("session.abort", cause),
      });
    });

  const respondToRequest: OpenCodeAdapterShape["respondToRequest"] = (
    threadId,
    requestId,
    decision,
  ) =>
    Effect.gen(function* () {
      const context = yield* resolveContext(threadId);
      const server = yield* ensureServer(threadId);
      const client = createScopedOpenCodeClient(server.baseUrl, context.cwd, server.authToken);
      yield* Effect.tryPromise({
        try: async () =>
          client.postSessionIdPermissionsPermissionId({
            path: {
              id: context.openCodeSessionId,
              permissionID: String(requestId),
            },
            body: {
              response:
                decision === "acceptForSession"
                  ? "always"
                  : decision === "accept"
                    ? "once"
                    : "reject",
            },
          }),
        catch: (cause) => toRequestError("session.permissions.respond", cause),
      });
    });

  const respondToUserInput: OpenCodeAdapterShape["respondToUserInput"] = (
    _threadId,
    _requestId,
    _answers: ProviderUserInputAnswers,
  ) =>
    Effect.fail(
      new ProviderAdapterValidationError({
        provider: PROVIDER,
        operation: "respondToUserInput",
        issue: "OpenCode does not support structured user-input requests.",
      }),
    );

  const stopSession: OpenCodeAdapterShape["stopSession"] = (threadId) =>
    Effect.gen(function* () {
      const context = yield* resolveContext(threadId);
      if (context.activeTurn) {
        yield* interruptTurn(threadId).pipe(Effect.ignore);
      }
      sessions.delete(threadId);
      threadIdByOpenCodeSessionId.delete(context.openCodeSessionId);
      yield* offerRuntimeEvent({
        type: "session.exited",
        eventId: nextEventId("session-exited"),
        provider: PROVIDER,
        threadId,
        createdAt: nowIso(),
        payload: {
          exitKind: "graceful",
          reason: "Session stopped.",
        },
      });
    });

  const listSessions: OpenCodeAdapterShape["listSessions"] = () =>
    Effect.sync(() => Array.from(sessions.values()).map((context) => context.session));

  const hasSession: OpenCodeAdapterShape["hasSession"] = (threadId) =>
    Effect.sync(() => sessions.has(threadId));

  const readThread: OpenCodeAdapterShape["readThread"] = (threadId) =>
    Effect.gen(function* () {
      const context = yield* resolveContext(threadId);
      const server = yield* ensureServer(threadId);
      const client = createScopedOpenCodeClient(server.baseUrl, context.cwd, server.authToken);
      const response = yield* Effect.tryPromise({
        try: async () =>
          client.session.messages({
            path: { id: context.openCodeSessionId },
          }),
        catch: (cause) => toRequestError("session.messages", cause),
      });
      const messages = response.data ?? [];

      return {
        threadId,
        turns: messages
          .filter((entry) => entry.info.role === "assistant")
          .map((entry) => ({
            id: TurnId.makeUnsafe(`opencode-turn:${entry.info.id}`),
            items: entry.parts as ReadonlyArray<unknown>,
          })),
      };
    });

  const rollbackThread: OpenCodeAdapterShape["rollbackThread"] = (threadId, numTurns) =>
    Effect.gen(function* () {
      const context = yield* resolveContext(threadId);
      const server = yield* ensureServer(threadId);
      const client = createScopedOpenCodeClient(server.baseUrl, context.cwd, server.authToken);
      const messages = yield* Effect.tryPromise({
        try: async () =>
          client.session.messages({
            path: { id: context.openCodeSessionId },
          }),
        catch: (cause) => toRequestError("session.messages", cause),
      });
      const assistantMessages = (messages.data ?? [])
        .filter((entry) => entry.info.role === "assistant")
        .slice(-numTurns)
        .reverse();

      for (const message of assistantMessages) {
        yield* Effect.tryPromise({
          try: async () =>
            client.session.revert({
              path: { id: context.openCodeSessionId },
              body: {
                messageID: message.info.id,
              },
            }),
          catch: (cause) => toRequestError("session.revert", cause),
        });
      }

      return yield* readThread(threadId);
    });

  const stopAll: OpenCodeAdapterShape["stopAll"] = () =>
    Effect.gen(function* () {
      for (const threadId of Array.from(sessions.keys())) {
        yield* stopSession(threadId).pipe(Effect.ignore);
      }
    });

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      stopRunningServer();
      yield* Queue.shutdown(runtimeEventQueue);
    }),
  );

  return {
    provider: PROVIDER,
    capabilities: {
      sessionModelSwitch: "in-session",
    },
    startSession,
    sendTurn,
    interruptTurn,
    readThread,
    rollbackThread,
    respondToRequest,
    respondToUserInput,
    stopSession,
    listSessions,
    hasSession,
    stopAll,
    streamEvents: Stream.fromQueue(runtimeEventQueue),
  } satisfies OpenCodeAdapterShape;
});

export const OpenCodeAdapterLive = Layer.effect(OpenCodeAdapter, makeOpenCodeAdapter);

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useListAiConversations, useCreateAiConversation,
  useGetAiConversation, getGetAiConversationQueryKey, useDeleteAiConversation,
  useListAiSuggestedQuestions, useEscalateAiConversation,
  useGetAiProvider, getAuthToken,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Send, Plus, Trash2, Bot, User, Sparkles, Loader2,
  BookOpen, GraduationCap, Ticket, ArrowRight, Package, Wrench,
  AlertTriangle, Cpu, StopCircle, ExternalLink,
  Volume2, VolumeX, Volume1, Menu, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useVoiceOutput } from "@/hooks/useVoiceOutput";
import { VoiceButton } from "@/components/voice/VoiceButton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RAGSource {
  id: string;
  type: "kb" | "academy" | "support" | "product";
  title: string;
  url: string;
  excerpt: string;
}

interface SuggestedAction {
  type: "escalate" | "navigate" | "reorder" | "book_service";
  label: string;
  data?: Record<string, unknown>;
}

interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: RAGSource[] | null;
  suggestedActions?: SuggestedAction[] | null;
  createdAt?: string | null;
}

interface StreamState {
  content: string;
  sources: RAGSource[];
  actions: SuggestedAction[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uiLang(lang: string | undefined) {
  return lang?.split("-")[0] || "en";
}

function formatTime(d: string | Date | null | undefined, lang: string) {
  if (!d) return "";
  return new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

function formatDate(d: string | Date | null | undefined, lang: string, labels: { today: string; yesterday: string }) {
  if (!d) return "";
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return labels.today;
  if (date.toDateString() === yesterday.toDateString()) return labels.yesterday;
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" as const } : {}),
  }).format(date);
}

/** Server stores the literal "New Conversation" until the first exchange auto-titles it. */
const DEFAULT_SERVER_TITLE = "New Conversation";

function displayConvTitle(title: string | null | undefined, fallback: string) {
  const trimmed = title?.trim();
  return !trimmed || trimmed === DEFAULT_SERVER_TITLE ? fallback : trimmed;
}

function RichText({ text }: { text: string }) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.startsWith("**") && seg.endsWith("**")) {
          return <strong key={i}>{seg.slice(2, -2)}</strong>;
        }
        return (
          <span key={i}>
            {seg.split("\n").map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
}

// ─── Source Citations ─────────────────────────────────────────────────────────

function SourceIcon({ type }: { type: RAGSource["type"] }) {
  const cls = "w-3 h-3 stroke-[1.75]";
  if (type === "kb") return <BookOpen className={cls} />;
  if (type === "academy") return <GraduationCap className={cls} />;
  if (type === "support") return <Ticket className={cls} />;
  return <Package className={cls} />;
}

function SourceCitations({ sources }: { sources: RAGSource[] }) {
  const { t } = useTranslation();
  if (!sources.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-foreground/10">
      <p className="text-xs text-muted-foreground mb-2">
        {t("ai.sources")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s) => (
          <Link key={s.id} href={s.url}>
            <Badge
              variant="outline"
              className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground cursor-pointer bg-background hover:text-foreground hover:border-foreground/20 transition-colors py-0.5"
            >
              <SourceIcon type={s.type} />
              <span className="max-w-[150px] truncate">{s.title}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-40" />
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Suggested Actions ────────────────────────────────────────────────────────

function ActionIcon({ type }: { type: string }) {
  const cls = "w-3.5 h-3.5 stroke-[1.75]";
  if (type === "escalate") return <AlertTriangle className={cls} />;
  if (type === "reorder") return <Package className={cls} />;
  if (type === "book_service") return <Wrench className={cls} />;
  return <ArrowRight className={cls} />;
}

function SuggestedActions({
  actions,
  onEscalate,
}: {
  actions: SuggestedAction[];
  onEscalate: () => void;
}) {
  if (!actions.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {actions.map((a, i) => {
        if (a.type === "escalate") {
          return (
            <Button
              key={i}
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={onEscalate}
            >
              <ActionIcon type={a.type} />
              {a.label}
            </Button>
          );
        }
        const url = (a.data?.url as string) ?? "/";
        return (
          <Link key={i} href={url}>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
              <ActionIcon type={a.type} />
              {a.label}
            </Button>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  onEscalate,
  stream,
  onSpeak,
  isSpeaking,
}: {
  message: StoredMessage;
  onEscalate: () => void;
  stream?: StreamState;
  onSpeak?: (text: string, id: string) => void;
  isSpeaking?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const isUser = message.role === "user";
  const displayContent = stream ? stream.content : message.content;
  const sources = stream ? stream.sources : (message.sources ?? []);
  const actions = stream ? stream.actions : (message.suggestedActions ?? []);
  const isStreaming = !!stream;
  const canSpeak = !isUser && !isStreaming && !!displayContent && !!onSpeak;

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="w-3.5 h-3.5 stroke-[1.75]" /> : <Bot className="w-3.5 h-3.5 stroke-[1.75]" />}
      </div>

      <div className={cn("flex flex-col min-w-0 max-w-[85%] sm:max-w-[82%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "max-w-full rounded-2xl px-4 py-3 text-sm leading-relaxed [overflow-wrap:anywhere]",
            isUser
              ? "bg-foreground text-background rounded-tr-md"
              : "bg-muted text-foreground rounded-tl-md"
          )}
        >
          {displayContent ? (
            <span className="whitespace-pre-wrap">
              <RichText text={displayContent} />
              {isStreaming && (
                <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle opacity-70" />
              )}
            </span>
          ) : isStreaming ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
              </span>
            </span>
          ) : null}

          {!isUser && !isStreaming && sources.length > 0 && (
            <SourceCitations sources={sources} />
          )}
        </div>

        {!isUser && !isStreaming && actions.length > 0 && (
          <SuggestedActions actions={actions} onEscalate={onEscalate} />
        )}

        <div className={cn(
          "flex items-center gap-2 px-1 mt-1",
          isUser ? "justify-end" : "justify-start"
        )}>
          <p className="text-[11px] text-muted-foreground/60 tabular-nums">
            {formatTime(message.createdAt, uiLang(i18n.language))}
          </p>
          {canSpeak && (
            <button
              type="button"
              onClick={() => onSpeak(displayContent, message.id)}
              aria-label={isSpeaking ? t("ai.stop_reading") : t("ai.read_aloud")}
              className={cn(
                "w-5 h-5 flex items-center justify-center rounded-full transition-colors",
                "text-muted-foreground/40 hover:text-muted-foreground focus:outline-none",
                isSpeaking && "text-foreground hover:text-foreground/80"
              )}
            >
              {isSpeaking
                ? <Volume2 className="w-3.5 h-3.5" />
                : <Volume1 className="w-3.5 h-3.5" />
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Suggestion pills ─────────────────────────────────────────────────────────

// i18n keys — used whenever the UI is not in English, because the DB-managed
// suggestions (ai_suggested_questions) are English-only.
const DEFAULT_PILL_KEYS = [
  "ai.pill_install",
  "ai.pill_event",
  "ai.pill_print",
  "ai.pill_pricing",
] as const;

// ─── Integrated input bar (shared between welcome + chat states) ──────────────

function InputBar({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  isDisabled,
  voiceInput,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isStreaming: boolean;
  isDisabled: boolean;
  voiceInput: ReturnType<typeof useVoiceInput>;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const { t } = useTranslation();
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  // Auto-grow up to ~6 lines so long questions/placeholders never clip.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value, ref]);
  return (
    <div className="relative">
      {voiceInput.isListening && (
        <div className="absolute -top-7 left-0 flex items-center gap-1.5 text-xs text-destructive font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse shrink-0" />
          {voiceInput.partialTranscript || t("ai.listening")}
        </div>
      )}
      <div className={cn(
        "flex items-end gap-1 rounded-2xl border border-border bg-card pl-4 pr-2 py-2 transition-colors",
        "focus-within:border-foreground/30"
      )}>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={voiceInput.isListening ? t("ai.listening_short") : (placeholder ?? t("ai.chat_placeholder"))}
          disabled={isStreaming || voiceInput.isActive || isDisabled}
          className="flex-1 min-w-0 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground placeholder:truncate py-2.5 max-h-40 overflow-y-auto"
          autoComplete="off"
        />
        <div className="flex items-center gap-1 shrink-0">
          {voiceInput.isSupported && (
            <VoiceButton
              state={voiceInput.state}
              onClick={() => void voiceInput.start()}
              disabled={isStreaming}
              partialTranscript={voiceInput.partialTranscript}
            />
          )}
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="p-2 rounded-xl bg-muted text-foreground hover:bg-muted/70 transition-colors"
              aria-label={t("ai.stop_generating")}
            >
              <StopCircle className="w-4 h-4 stroke-[1.75]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!value.trim() || voiceInput.isActive || isDisabled}
              className="p-2 rounded-xl bg-foreground text-background disabled:opacity-25 hover:bg-foreground/90 transition-colors"
              aria-label={t("ai.send_message")}
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIAssistant() {
  const { t, i18n } = useTranslation();
  const lang = uiLang(i18n.language);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [stream, setStream] = useState<StreamState | null>(null);
  const [pendingUserMsg, setPendingUserMsg] = useState<string | null>(null);
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const welcomeInputRef = useRef<HTMLTextAreaElement>(null);
  const streamFinalContentRef = useRef("");

  const { data: convsData, isLoading: convsLoading } = useListAiConversations();
  const { data: activeConv, isLoading: convLoading } = useGetAiConversation(
    activeConvId ?? "skip",
    { query: { enabled: !!activeConvId, queryKey: getGetAiConversationQueryKey(activeConvId ?? "skip") } },
  );
  const { data: suggestionsData } = useListAiSuggestedQuestions();
  const { data: providerData } = useGetAiProvider();

  const { mutate: createConv, isPending: isCreating } = useCreateAiConversation({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
        setActiveConvId(data.id ?? null);
        setTimeout(() => chatInputRef.current?.focus(), 100);
      },
    },
  });
  const newConv = () => createConv(undefined as unknown as void);

  const { mutate: deleteConv, isPending: isDeleting } = useDeleteAiConversation({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
        setActiveConvId(null);
        setStream(null);
        setPendingUserMsg(null);
        toast({ title: t("ai.conv_deleted") });
      },
    },
  });

  const { mutate: doEscalate, isPending: isEscalating } = useEscalateAiConversation({
    mutation: {
      onSuccess: (data) => {
        setEscalateOpen(false);
        toast({
          title: t("ai.ticket_created_msg"),
          description: data.ticket?.title ?? t("ai.ticket_created_msg"),
        });
      },
      onError: () => toast({ title: t("ai.ticket_failed"), variant: "destructive" }),
    },
  });

  // ─── Voice output ─────────────────────────────────────────────────────────

  const voiceOutput = useVoiceOutput();

  // ─── Auto-scroll ─────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [(activeConv as { messages?: unknown[] } | undefined)?.messages?.length, stream?.content]);

  // ─── Core streaming function — takes convId directly, no stale closure ──────
  // This is the single source of truth for sending a message and streaming the
  // response. By accepting convId as a parameter it never reads activeConvId
  // from a potentially-stale closure, so it can safely be called from any
  // context: onSuccess callbacks, click handlers, or the sendMessage wrapper.

  const streamConversation = useCallback(
    async (convId: string, msgText: string) => {
      if (!convId || !msgText.trim() || stream) return;
      setPendingUserMsg(msgText);
      streamFinalContentRef.current = "";

      const ac = new AbortController();
      setAbortCtrl(ac);
      setStream({ content: "", sources: [], actions: [] });
      let completed = false;

      try {
        const authToken = await getAuthToken();
        const response = await fetch(`/api/ai/conversations/${convId}/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ content: msgText }),
          signal: ac.signal,
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
          throw new Error(errBody.error ?? `HTTP ${response.status}`);
        }

        if (!response.body) throw new Error(t("ai.error"));
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
              let evt: {
                type: string;
                content?: string;
                sources?: RAGSource[];
                actions?: SuggestedAction[];
                error?: string;
              };
              try {
                evt = JSON.parse(trimmed.slice(5).trim());
              } catch {
                throw new Error(t("ai.error"));
              }
              if (evt.type === "user_message") {
                // no-op: persisted server-side
              } else if (evt.type === "content") {
                setStream((prev) => {
                  if (!prev) return null;
                  const updated = { ...prev, content: prev.content + (evt.content ?? "") };
                  streamFinalContentRef.current = updated.content;
                  return updated;
                });
              } else if (evt.type === "sources") {
                setStream((prev) => prev ? { ...prev, sources: evt.sources ?? [] } : null);
              } else if (evt.type === "actions") {
                setStream((prev) => prev ? { ...prev, actions: evt.actions ?? [] } : null);
              } else if (evt.type === "error") {
                throw new Error(evt.error ?? "AI error");
              } else if (evt.type === "done") {
                completed = true;
                await reader.cancel();
                break outer;
              }
          }
        }
        if (!completed) throw new Error(t("ai.error"));
      } catch (err: unknown) {
        if ((err as { name?: string }).name === "AbortError") return;
        const errorMessage = (err as Error).message;
        toast({
          title: t("common.error"),
          description: errorMessage?.startsWith("AI_PROVIDER_UNAVAILABLE")
            ? t("ai.provider_unavailable")
            : errorMessage ?? t("ai.error"),
          variant: "destructive",
        });
      } finally {
        ac.abort();
        const finalContent = streamFinalContentRef.current;
        streamFinalContentRef.current = "";
        setStream(null);
        setAbortCtrl(null);
        setPendingUserMsg(null);
        qc.invalidateQueries({ queryKey: [`/api/ai/conversations/${convId}`] });
        qc.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
        if (completed && autoPlay && finalContent) {
          voiceOutput.speak(finalContent, "latest-response");
        }
      }
    },
    // deliberately excludes activeConvId — convId is passed as a parameter
    [stream, qc, toast, autoPlay, voiceOutput, t]
  );

  // ─── sendMessage: wrapper used by the chat input (activeConvId is set) ─────

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      if (!activeConvId) return;
      const msg = (overrideText ?? input).trim();
      if (!msg) return;
      setInput("");
      await streamConversation(activeConvId, msg);
    },
    [input, activeConvId, streamConversation]
  );

  const stopStreaming = () => {
    abortCtrl?.abort();
    setStream(null);
    setAbortCtrl(null);
    setPendingUserMsg(null);
  };

  // ─── Welcome state submit: pill click or typed Enter ─────────────────────
  // Creates a conversation then calls streamConversation directly with the
  // returned ID — no React state intermediary, no stale closure possible.

  const handleWelcomeSubmit = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isCreating) return;
    if (!text) setInput("");
    createConv(undefined as unknown as void, {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
        const convId = data.id;
        if (!convId) return;
        setActiveConvId(convId);
        setTimeout(() => chatInputRef.current?.focus(), 100);
        void streamConversation(convId, msg);
      },
      onError: () => {
        toast({ title: t("ai.conv_failed"), variant: "destructive" });
      },
    });
  };

  // ─── Voice input ──────────────────────────────────────────────────────────

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      if (activeConvId) {
        void streamConversation(activeConvId, text);
      } else {
        createConv(undefined as unknown as void, {
          onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
            const convId = data.id;
            if (!convId) return;
            setActiveConvId(convId);
            void streamConversation(convId, text);
          },
        });
      }
    },
    [activeConvId, streamConversation, createConv, qc]
  );

  const voiceInput = useVoiceInput({
    onTranscript: handleVoiceTranscript,
    onError: (msg) =>
      toast({ title: t("ai.voice_input_error"), description: msg, variant: "destructive" }),
  });

  // ─── Derived state ────────────────────────────────────────────────────────

  const messages = ((activeConv as unknown as { messages?: StoredMessage[] })?.messages ?? []);
  const conversations = convsData?.items ?? [];
  const suggestions = suggestionsData?.items ?? [];
  const convTitle = displayConvTitle((activeConv as unknown as { title?: string })?.title, t("ai.new_conversation"));
  const providerName = providerData?.name ?? t("ai.title");
  const dateLabels = { today: t("common.today"), yesterday: t("common.yesterday") };
  const isStreaming = !!stream;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pills = lang === "en" && suggestions.length > 0
    ? suggestions.slice(0, 4).map((s) => s.question)
    : DEFAULT_PILL_KEYS.map((key) => t(key));

  const displayMessages: Array<StoredMessage & { isOptimistic?: boolean }> = [
    ...messages,
    ...(pendingUserMsg && !messages.find((m) => m.content === pendingUserMsg && m.role === "user")
      ? [{ id: "pending-user", role: "user" as const, content: pendingUserMsg, createdAt: new Date().toISOString(), isOptimistic: true }]
      : []),
  ];

  return (
    <div className="relative flex -mx-4 -my-6 md:-mx-10 md:-my-10 h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)] overflow-hidden" data-testid="page-ai-assistant">

      {/* ── Mobile backdrop ────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="absolute inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Conversation sidebar ──────────────────────────────────────────── */}
      <div className={cn(
        "flex flex-col border-r border-border bg-background lg:bg-muted/30 shrink-0",
        "absolute lg:relative inset-y-0 left-0 z-40 w-72 lg:w-60",
        sidebarOpen ? "flex" : "hidden lg:flex"
      )}>
        <div className="relative p-3 border-b border-border">
          <button
            onClick={() => newConv()}
            disabled={isCreating}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-card hover:bg-muted/50 py-2 text-sm font-medium text-foreground transition-colors disabled:opacity-50 pr-10 lg:pr-2"
          >
            {isCreating
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Plus className="w-3.5 h-3.5" />}
            {t("ai.new_chat")}
          </button>
          <button
            className="lg:hidden absolute top-1/2 -translate-y-1/2 right-4 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={() => setSidebarOpen(false)}
            aria-label={t("ai.close_history")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="p-2 space-y-0.5">
            {convsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8 px-3 leading-relaxed">
                {t("ai.no_conversations_title")}
              </p>
            ) : (
              conversations.map((c) => {
                const title = displayConvTitle(c.title, t("ai.new_conversation"));
                return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveConvId(c.id ?? null);
                    setStream(null);
                    setPendingUserMsg(null);
                    voiceOutput.stop();
                    setSidebarOpen(false);
                  }}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setActiveConvId(c.id ?? null); setSidebarOpen(false); } }}
                  title={title}
                  className={cn(
                    "w-full min-w-0 text-left rounded-lg px-3 py-2.5 text-sm transition-colors group cursor-pointer",
                    activeConvId === c.id
                      ? "bg-muted text-foreground"
                      : "hover:bg-muted/60 text-foreground"
                  )}
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate leading-tight text-sm">{title}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (c.id) deleteConv({ id: c.id }); }}
                      className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 mt-0.5"
                      aria-label={t("ai.delete_conv_title")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 tabular-nums mt-0.5">{formatDate(c.updatedAt, lang, dateLabels)}</p>
                </div>
                );
              })
            )}
          </div>
        </div>

        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <Cpu className="w-3 h-3 stroke-[1.75] text-muted-foreground/60 shrink-0" />
            <span className="text-[11px] text-muted-foreground/70 truncate">{providerName}</span>
          </div>
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">

        {!activeConvId ? (
          /* ── Welcome / empty state ──────────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 py-8 md:py-12 overflow-auto relative">
            <button
              className="lg:hidden absolute top-4 left-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => setSidebarOpen(true)}
              aria-label={t("ai.open_history")}
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="w-full max-w-2xl flex flex-col items-center">

              {/* Icon + title */}
              <Sparkles className="w-5 h-5 stroke-[1.75] text-muted-foreground mb-4" />
              <h1 className="text-2xl md:text-[28px] font-semibold text-foreground mb-1.5 tracking-tight text-center">
                {t("ai.assistant_name")}
              </h1>
              <p className="text-muted-foreground text-sm mb-8 text-center">
                {t("ai.help_question")}
              </p>

              {/* Integrated input */}
              <div className="w-full mb-5">
                <InputBar
                  value={input}
                  onChange={setInput}
                  onSubmit={() => handleWelcomeSubmit()}
                  onStop={stopStreaming}
                  isStreaming={false}
                  isDisabled={isCreating}
                  voiceInput={voiceInput}
                  placeholder={t("ai.placeholder")}
                  inputRef={welcomeInputRef}
                />
              </div>

              {/* Suggestion pills */}
              <div className="flex flex-wrap justify-center gap-2">
                {pills.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handleWelcomeSubmit(p)}
                    disabled={isCreating}
                    className="max-w-full px-3.5 py-1.5 rounded-full border border-border bg-card text-[13px] text-left text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

        ) : (
          /* ── Active conversation ──────────────────────────────────────────── */
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between gap-2 px-3 md:px-5 py-2.5 border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
                <button
                  className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                  onClick={() => setSidebarOpen(true)}
                  aria-label={t("ai.open_history")}
                >
                  <Menu className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate text-foreground">{convTitle}</p>
                  <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
                    {isStreaming ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                        {t("ai.generating")}
                      </span>
                    ) : (
                      t("ai.message_count", { count: messages.length })
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {voiceOutput.isSupported && (
                  <button
                    onClick={() => {
                      if (autoPlay) voiceOutput.stop();
                      setAutoPlay((v) => !v);
                    }}
                    title={autoPlay ? t("ai.auto_read_on") : t("ai.auto_read_off")}
                    aria-label={autoPlay ? t("ai.auto_read_on") : t("ai.auto_read_off")}
                    aria-pressed={autoPlay}
                    className={cn(
                      "w-8 h-8 flex items-center justify-center rounded-lg transition-colors",
                      autoPlay
                        ? "text-foreground bg-muted hover:bg-muted/70"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {autoPlay ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                )}
                <button
                  onClick={() => setEscalateOpen(true)}
                  disabled={messages.length === 0}
                  className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-border text-foreground hover:bg-muted/50 text-xs font-medium transition-colors disabled:opacity-40"
                >
                  <AlertTriangle className="w-3.5 h-3.5 stroke-[1.75] text-warning" />
                  {t("ai.escalate_short")}
                </button>
                <button
                  onClick={() => { if (activeConvId) deleteConv({ id: activeConvId }); }}
                  disabled={isDeleting}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                  aria-label={t("ai.delete_conv_title")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 min-h-0 [&_[data-radix-scroll-area-viewport]>div]:!block">
              <div className="px-4 py-5 md:px-6 md:py-6 space-y-6 max-w-3xl mx-auto w-full">
                {convLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : displayMessages.length === 0 && !isStreaming ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <p className="text-sm text-muted-foreground">{t("ai.send_get_started")}</p>
                    <div className="flex flex-wrap justify-center gap-2 max-w-md">
                      {pills.slice(0, 3).map((p, i) => (
                        <button
                          key={i}
                          onClick={() => void sendMessage(p)}
                          disabled={isStreaming}
                          className="px-3 py-1.5 rounded-full border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {displayMessages.map((m) => (
                      <MessageBubble
                        key={m.id}
                        message={m}
                        onEscalate={() => setEscalateOpen(true)}
                        onSpeak={voiceOutput.isSupported
                          ? (text, id) => voiceOutput.toggle(text, id)
                          : undefined
                        }
                        isSpeaking={voiceOutput.speakingId === m.id && voiceOutput.isPlaying}
                      />
                    ))}
                    {isStreaming && stream && (
                      <MessageBubble
                        key="streaming"
                        message={{
                          id: "streaming",
                          role: "assistant",
                          content: "",
                          createdAt: new Date().toISOString(),
                        }}
                        onEscalate={() => setEscalateOpen(true)}
                        stream={stream}
                      />
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input bar */}
            <div className="border-t border-border bg-background px-3 py-3 md:px-5 md:py-4 shrink-0">
              <div className="max-w-3xl mx-auto">
                <InputBar
                  value={input}
                  onChange={setInput}
                  onSubmit={() => void sendMessage()}
                  onStop={stopStreaming}
                  isStreaming={isStreaming}
                  isDisabled={false}
                  voiceInput={voiceInput}
                  inputRef={chatInputRef}
                />
                <p className="text-[11px] text-muted-foreground/50 text-center mt-2.5">
                  {t("ai.powered_by")}
                  {providerData && <span className="ml-1">· {providerData.name}</span>}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Escalation dialog ─────────────────────────────────────────────── */}
      <Dialog open={escalateOpen} onOpenChange={setEscalateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 stroke-[1.75] text-warning" />
              {t("ai.escalate")}
            </DialogTitle>
            <DialogDescription>
              {t("ai.escalate_dialog_desc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setEscalateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                if (activeConvId) {
                  doEscalate({
                    id: activeConvId,
                    data: { subject: `AI Chat: ${convTitle}`, priority: "medium" },
                  });
                }
              }}
              disabled={isEscalating}
            >
              {isEscalating
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Ticket className="w-4 h-4" />}
              {t("ai.create_ticket")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

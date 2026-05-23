import { useState, useRef, useEffect, useCallback } from "react";
import {
  useListAiConversations, useCreateAiConversation,
  useGetAiConversation, useDeleteAiConversation,
  useListAiSuggestedQuestions, useEscalateAiConversation,
  useGetAiProvider,
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
  Volume2, VolumeX, Volume1,
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

function formatTime(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  const cls = "w-3 h-3";
  if (type === "kb") return <BookOpen className={cls} />;
  if (type === "academy") return <GraduationCap className={cls} />;
  if (type === "support") return <Ticket className={cls} />;
  return <Package className={cls} />;
}

function SourceCitations({ sources }: { sources: RAGSource[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">
        Sources
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s) => (
          <Link key={s.id} href={s.url}>
            <Badge
              variant="secondary"
              className="flex items-center gap-1 text-[11px] cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors py-0.5"
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
  const cls = "w-3.5 h-3.5";
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
              className="h-7 text-xs gap-1.5 border-warning/30 text-warning hover:bg-warning/8"
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
          "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-foreground text-background"
        )}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>

      <div className={cn("flex flex-col max-w-[82%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-card border border-border rounded-tl-sm"
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
          <p className="text-[11px] text-muted-foreground/60">
            {formatTime(message.createdAt)}
          </p>
          {canSpeak && (
            <button
              type="button"
              onClick={() => onSpeak(displayContent, message.id)}
              aria-label={isSpeaking ? "Stop speaking" : "Read aloud"}
              className={cn(
                "w-5 h-5 flex items-center justify-center rounded-full transition-colors",
                "text-muted-foreground/40 hover:text-muted-foreground focus:outline-none",
                isSpeaking && "text-accent hover:text-accent/80"
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

const DEFAULT_PILLS = [
  "My printer is jamming",
  "How do I reorder consumables?",
  "Which Academy course should I start with?",
  "How should I price a wedding event?",
];

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
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="relative">
      {voiceInput.isListening && (
        <div className="absolute -top-7 left-0 flex items-center gap-1.5 text-xs text-destructive font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse shrink-0" />
          {voiceInput.partialTranscript || "Listening… speak your question"}
        </div>
      )}
      <div className={cn(
        "flex items-center gap-1 rounded-2xl border bg-card pl-4 pr-2 py-2 transition-shadow",
        "focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-ring/50 shadow-sm"
      )}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={voiceInput.isListening ? "Listening…" : (placeholder ?? "Message HaloLight AI…")}
          disabled={isStreaming || voiceInput.isActive || isDisabled}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground py-1.5 min-w-0"
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
              className="p-2 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              aria-label="Stop generating"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!value.trim() || voiceInput.isActive || isDisabled}
              className="p-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-25 hover:bg-primary/90 transition-all"
              aria-label="Send message"
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
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [stream, setStream] = useState<StreamState | null>(null);
  const [pendingUserMsg, setPendingUserMsg] = useState<string | null>(null);
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [pendingVoiceSend, setPendingVoiceSend] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const welcomeInputRef = useRef<HTMLInputElement>(null);
  const streamFinalContentRef = useRef("");

  const { data: convsData, isLoading: convsLoading } = useListAiConversations();
  const { data: activeConv, isLoading: convLoading } = useGetAiConversation(
    activeConvId ?? "skip"
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
        toast({ title: "Conversation deleted" });
      },
    },
  });

  const { mutate: doEscalate, isPending: isEscalating } = useEscalateAiConversation({
    mutation: {
      onSuccess: (data) => {
        setEscalateOpen(false);
        toast({
          title: "Support ticket created",
          description: data.ticket?.title ?? "Ticket opened successfully",
        });
      },
      onError: () => toast({ title: "Failed to create ticket", variant: "destructive" }),
    },
  });

  // ─── Voice output ─────────────────────────────────────────────────────────

  const voiceOutput = useVoiceOutput();

  // ─── Auto-scroll ─────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [(activeConv as { messages?: unknown[] } | undefined)?.messages?.length, stream?.content]);

  // ─── Streaming send ──────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const msg = (overrideText ?? input).trim();
      if (!msg || !activeConvId || stream) return;
      setInput("");
      setPendingUserMsg(msg);
      streamFinalContentRef.current = "";

      const ac = new AbortController();
      setAbortCtrl(ac);
      setStream({ content: "", sources: [], actions: [] });

      try {
        const response = await fetch(`/api/ai/conversations/${activeConvId}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ content: msg }),
          signal: ac.signal,
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
          throw new Error(errBody.error ?? `HTTP ${response.status}`);
        }

        const reader = response.body!.getReader();
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
            try {
              const evt = JSON.parse(trimmed.slice(5).trim()) as {
                type: string;
                content?: string;
                sources?: RAGSource[];
                actions?: SuggestedAction[];
                error?: string;
              };
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
                reader.cancel();
                break outer;
              }
            } catch (parseErr) {
              if ((parseErr as Error).message !== "AI error") continue;
              throw parseErr;
            }
          }
        }
      } catch (err: unknown) {
        if ((err as { name?: string }).name === "AbortError") return;
        toast({
          title: "Something went wrong",
          description: (err as Error).message ?? "Failed to get AI response",
          variant: "destructive",
        });
      } finally {
        const finalContent = streamFinalContentRef.current;
        streamFinalContentRef.current = "";
        setStream(null);
        setAbortCtrl(null);
        setPendingUserMsg(null);
        qc.invalidateQueries({ queryKey: [`/api/ai/conversations/${activeConvId}`] });
        qc.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
        if (autoPlay && finalContent) {
          voiceOutput.speak(finalContent, "latest-response");
        }
      }
    },
    [input, activeConvId, stream, qc, toast, autoPlay, voiceOutput]
  );

  const stopStreaming = () => {
    abortCtrl?.abort();
    setStream(null);
    setAbortCtrl(null);
    setPendingUserMsg(null);
  };

  // Start a conversation from the welcome state (pill or typed input).
  // Uses setPendingVoiceSend + newConv() — same pattern as voice input — so the
  // useEffect below fires with a fresh sendMessage that has the updated activeConvId.
  const handleWelcomeSubmit = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isCreating) return;
    if (!text) setInput("");
    setPendingVoiceSend(msg);
    newConv();
  };

  // ─── Pending voice send: fires after a new conversation is activated ──────

  useEffect(() => {
    if (activeConvId && pendingVoiceSend && !stream) {
      const text = pendingVoiceSend;
      setPendingVoiceSend(null);
      void sendMessage(text);
    }
  }, [activeConvId, pendingVoiceSend, stream, sendMessage]);

  // ─── Voice input ──────────────────────────────────────────────────────────

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      if (activeConvId) {
        void sendMessage(text);
      } else {
        setPendingVoiceSend(text);
        newConv();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeConvId, sendMessage]
  );

  const voiceInput = useVoiceInput({
    onTranscript: handleVoiceTranscript,
    onError: (msg) =>
      toast({ title: "Voice input error", description: msg, variant: "destructive" }),
  });

  // ─── Derived state ────────────────────────────────────────────────────────

  const messages = ((activeConv as unknown as { messages?: StoredMessage[] })?.messages ?? []);
  const conversations = convsData?.items ?? [];
  const suggestions = suggestionsData?.items ?? [];
  const convTitle = (activeConv as unknown as { title?: string })?.title ?? "Conversation";
  const providerName = providerData?.name ?? "AI Assistant";
  const isStreaming = !!stream;

  const pills = suggestions.length > 0
    ? suggestions.slice(0, 4).map((s) => s.question)
    : DEFAULT_PILLS;

  const displayMessages: Array<StoredMessage & { isOptimistic?: boolean }> = [
    ...messages,
    ...(pendingUserMsg && !messages.find((m) => m.content === pendingUserMsg && m.role === "user")
      ? [{ id: "pending-user", role: "user" as const, content: pendingUserMsg, createdAt: new Date().toISOString(), isOptimistic: true }]
      : []),
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden" data-testid="page-ai-assistant">

      {/* ── Conversation sidebar ──────────────────────────────────────────── */}
      <div className="w-60 border-r bg-muted/10 flex flex-col shrink-0">
        <div className="p-3 border-b">
          <button
            onClick={() => newConv()}
            disabled={isCreating}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-card hover:bg-muted py-2 text-sm font-medium text-foreground transition-colors disabled:opacity-50"
          >
            {isCreating
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Plus className="w-3.5 h-3.5" />}
            New chat
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {convsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8 px-3 leading-relaxed">
                No conversations yet
              </p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveConvId(c.id ?? null);
                    setStream(null);
                    setPendingUserMsg(null);
                    voiceOutput.stop();
                  }}
                  className={cn(
                    "w-full text-left rounded-lg px-3 py-2.5 text-sm transition-colors group",
                    activeConvId === c.id
                      ? "bg-primary/8 text-primary"
                      : "hover:bg-muted/60 text-foreground"
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="truncate font-medium leading-tight text-sm">{c.title}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (c.id) deleteConv({ id: c.id }); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 mt-0.5"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">{formatDate(c.updatedAt)}</p>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40">
            <Cpu className="w-3 h-3 text-muted-foreground/60 shrink-0" />
            <span className="text-[11px] text-muted-foreground/70 truncate">{providerName}</span>
          </div>
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">

        {!activeConvId ? (
          /* ── Welcome / empty state ──────────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-auto">
            <div className="w-full max-w-2xl flex flex-col items-center">

              {/* Icon + title */}
              <div className="w-10 h-10 rounded-2xl bg-foreground flex items-center justify-center mb-5 shadow-md">
                <Sparkles className="w-5 h-5 text-background" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-1.5 tracking-tight">
                HaloLight AI Assistant
              </h1>
              <p className="text-muted-foreground text-sm mb-8">
                How can I help you today?
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
                  placeholder="Ask about equipment, pricing, bookings…"
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
                    className="px-3.5 py-1.5 rounded-full border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border/80 transition-colors disabled:opacity-50"
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
            <div className="flex items-center justify-between px-5 py-2.5 border-b bg-background/95 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-background" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate text-foreground">{convTitle}</p>
                  <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
                    {isStreaming ? (
                      <span className="flex items-center gap-1 text-accent">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        Generating…
                      </span>
                    ) : (
                      `${messages.length} message${messages.length !== 1 ? "s" : ""}`
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {voiceOutput.isSupported && (
                  <button
                    onClick={() => {
                      if (autoPlay) voiceOutput.stop();
                      setAutoPlay((v) => !v);
                    }}
                    title={autoPlay ? "Disable auto-read" : "Enable auto-read"}
                    className={cn(
                      "w-8 h-8 flex items-center justify-center rounded-lg transition-colors",
                      autoPlay
                        ? "text-foreground bg-accent/20 hover:bg-accent/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {autoPlay ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                )}
                <button
                  onClick={() => setEscalateOpen(true)}
                  disabled={messages.length === 0}
                  className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-warning/30 text-warning hover:bg-warning/8 text-xs font-medium transition-colors disabled:opacity-40"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Escalate
                </button>
                <button
                  onClick={() => { if (activeConvId) deleteConv({ id: activeConvId }); }}
                  disabled={isDeleting}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                  aria-label="Delete conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1">
              <div className="px-6 py-6 space-y-6 max-w-3xl mx-auto w-full">
                {convLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : displayMessages.length === 0 && !isStreaming ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <p className="text-sm text-muted-foreground">Send a message to get started</p>
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
            <div className="border-t bg-background px-5 py-4 shrink-0">
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
                  Powered by your Knowledge Base &amp; Academy
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
              <AlertTriangle className="w-5 h-5 text-warning" />
              Escalate to Support
            </DialogTitle>
            <DialogDescription>
              A support ticket will be created with a transcript of this conversation so our team
              can follow up directly. You'll be able to track it in your Support Tickets.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setEscalateOpen(false)}>
              Cancel
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
              Create Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

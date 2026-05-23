import { useState, useRef, useEffect, useCallback } from "react";
import {
  useListAiConversations, useCreateAiConversation,
  useGetAiConversation, useDeleteAiConversation,
  useListAiSuggestedQuestions, useEscalateAiConversation,
  useGetAiProvider,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Send, Plus, Trash2, Bot, User, Sparkles, MessageSquare, Loader2,
  BookOpen, GraduationCap, Ticket, ArrowRight, Package, Wrench,
  AlertTriangle, ChevronRight, Cpu, StopCircle, ExternalLink,
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

// Markdown-lite: **bold**, line breaks preserved
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
    <div className="mt-3 pt-3 border-t border-muted/60">
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
              className="h-7 text-xs gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50"
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
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-gradient-to-br from-violet-500 to-blue-600 text-white"
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div className={cn("max-w-[78%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm"
          )}
        >
          {displayContent ? (
            <span className="whitespace-pre-wrap">
              <RichText text={displayContent} />
              {isStreaming && (
                <span className="inline-block w-1 h-4 bg-current ml-0.5 animate-pulse align-middle" />
              )}
            </span>
          ) : isStreaming ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Thinking…
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
          <p className="text-[11px] text-muted-foreground">
            {formatTime(message.createdAt)}
          </p>
          {canSpeak && (
            <button
              type="button"
              onClick={() => onSpeak(displayContent, message.id)}
              aria-label={isSpeaking ? "Stop speaking" : "Read aloud"}
              className={cn(
                "w-5 h-5 flex items-center justify-center rounded-full transition-colors",
                "text-muted-foreground/50 hover:text-muted-foreground focus:outline-none",
                isSpeaking && "text-violet-500 hover:text-violet-600"
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

// ─── Default Starter Prompts ──────────────────────────────────────────────────

const STARTERS = [
  { icon: <Wrench className="w-4 h-4" />, text: "My printer is jamming — how do I fix it?" },
  { icon: <Package className="w-4 h-4" />, text: "How do I know when to reorder ribbon?" },
  { icon: <GraduationCap className="w-4 h-4" />, text: "What Academy courses should I start with?" },
  { icon: <MessageSquare className="w-4 h-4" />, text: "What's the best way to price a wedding event?" },
];

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
  const inputRef = useRef<HTMLInputElement>(null);
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
        setTimeout(() => inputRef.current?.focus(), 100);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const handleStarterClick = (text: string) => {
    createConv(undefined as unknown as void, {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
        if (data.id) {
          setActiveConvId(data.id);
          setTimeout(() => void sendMessage(text), 300);
        }
      },
    });
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

  const displayMessages: Array<StoredMessage & { isOptimistic?: boolean }> = [
    ...messages,
    ...(pendingUserMsg && !messages.find((m) => m.content === pendingUserMsg && m.role === "user")
      ? [{ id: "pending-user", role: "user" as const, content: pendingUserMsg, createdAt: new Date().toISOString(), isOptimistic: true }]
      : []),
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div className="w-64 border-r bg-muted/20 flex flex-col shrink-0">
        <div className="p-3 border-b">
          <Button
            className="w-full gap-2"
            onClick={() => newConv()}
            disabled={isCreating}
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            New Chat
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {convsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8 px-4">
                No conversations yet. Start a new chat!
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
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="truncate font-medium leading-tight text-sm">{c.title}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (c.id) deleteConv({ id: c.id }); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 mt-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(c.updatedAt)}</p>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Provider badge */}
        <div className="p-3 border-t">
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/60">
            <Cpu className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span className="text-[11px] text-muted-foreground truncate">{providerName}</span>
          </div>
        </div>
      </div>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!activeConvId ? (
          /* ── Welcome / empty state ─────────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center overflow-auto">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center mb-5 shadow-xl">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">HaloLight AI Assistant</h2>
            <p className="text-muted-foreground max-w-sm mb-8 text-sm">
              Ask me anything about your equipment, consumables, bookings, or business operations.
              I'll search your knowledge base and academy for the best answers.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mb-8">
              {(suggestions.length > 0
                ? suggestions.slice(0, 4).map((s) => ({ icon: <MessageSquare className="w-4 h-4" />, text: s.question }))
                : STARTERS
              ).map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleStarterClick(p.text ?? "")}
                  disabled={isCreating}
                  className="flex items-start gap-3 p-3.5 rounded-xl border bg-card hover:bg-muted/50 text-left text-sm transition-colors group"
                >
                  <span className="text-primary mt-0.5 shrink-0">{p.icon}</span>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors flex-1 text-sm">{p.text ?? ""}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5 group-hover:text-muted-foreground transition-colors" />
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={() => newConv()} disabled={isCreating} size="lg" className="gap-2">
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Start a conversation
              </Button>
              {voiceInput.isSupported && (
                <VoiceButton
                  state={voiceInput.state}
                  onClick={() => void voiceInput.start()}
                  partialTranscript={voiceInput.partialTranscript}
                />
              )}
            </div>
          </div>
        ) : (
          <>
            {/* ── Chat header ────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-3 border-b bg-background/90 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate">{convTitle}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {isStreaming ? (
                      <span className="flex items-center gap-1 text-violet-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                        Generating…
                      </span>
                    ) : (
                      `${messages.length} message${messages.length !== 1 ? "s" : ""}`
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {/* TTS auto-play toggle */}
                {voiceOutput.isSupported && (
                  <Button
                    size="sm"
                    variant={autoPlay ? "secondary" : "ghost"}
                    className={cn(
                      "h-8 w-8 p-0 transition-colors",
                      autoPlay
                        ? "text-violet-600 bg-violet-50 hover:bg-violet-100"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => {
                      if (autoPlay) voiceOutput.stop();
                      setAutoPlay((v) => !v);
                    }}
                    title={autoPlay ? "Disable auto-read responses" : "Enable auto-read responses"}
                  >
                    {autoPlay ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-8 text-xs border-orange-200 text-orange-700 hover:bg-orange-50"
                  onClick={() => setEscalateOpen(true)}
                  disabled={messages.length === 0}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Escalate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => { if (activeConvId) deleteConv({ id: activeConvId }); }}
                  disabled={isDeleting}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* ── Messages ─────────────────────────────────────────────── */}
            <ScrollArea className="flex-1">
              <div className="px-5 py-6 space-y-6 max-w-3xl mx-auto w-full">
                {convLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : displayMessages.length === 0 && !isStreaming ? (
                  <div className="text-center py-16 space-y-3">
                    <MessageSquare className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                    <p className="text-muted-foreground text-sm">Send a message to get started</p>
                    {suggestions.slice(0, 3).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => void sendMessage(s.question)}
                        disabled={isStreaming}
                        className="block w-full max-w-xs mx-auto text-xs text-primary hover:underline"
                      >
                        {s.question}
                      </button>
                    ))}
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
                    {/* Streaming assistant response */}
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

            {/* ── Input ────────────────────────────────────────────────── */}
            <div className="border-t bg-background px-4 py-4 shrink-0">
              <div className="max-w-3xl mx-auto">
                {/* Listening indicator bar */}
                {voiceInput.isListening && (
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-xs text-destructive font-medium">
                      {voiceInput.partialTranscript
                        ? voiceInput.partialTranscript
                        : "Listening… speak your question"}
                    </span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      voiceInput.isListening
                        ? "Listening…"
                        : "Ask about equipment, consumables, bookings…"
                    }
                    disabled={isStreaming || voiceInput.isActive}
                    className="flex-1 h-11"
                    autoComplete="off"
                  />
                  {voiceInput.isSupported && (
                    <VoiceButton
                      state={voiceInput.state}
                      onClick={() => void voiceInput.start()}
                      disabled={isStreaming}
                      partialTranscript={voiceInput.partialTranscript}
                    />
                  )}
                  {isStreaming ? (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      onClick={stopStreaming}
                    >
                      <StopCircle className="w-5 h-5" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      onClick={() => void sendMessage()}
                      disabled={!input.trim() || voiceInput.isActive}
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  Responses are powered by your Knowledge Base &amp; Academy content.
                  {providerData && (
                    <span className="ml-1 text-muted-foreground/60">· {providerData.name}</span>
                  )}
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
              <AlertTriangle className="w-5 h-5 text-orange-500" />
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
              className="gap-2 bg-orange-600 hover:bg-orange-700 text-white"
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

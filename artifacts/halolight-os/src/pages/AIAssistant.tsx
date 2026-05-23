import { useState, useRef, useEffect } from "react";
import {
  useListAiConversations, useCreateAiConversation,
  useGetAiConversation, useDeleteAiConversation,
  useSendAiMessage, useListAiSuggestedQuestions,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Plus, Trash2, Bot, User, Sparkles, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTime(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function AIAssistant() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: convsData, isLoading: convsLoading } = useListAiConversations();
  const { data: activeConv, isLoading: convLoading } = useGetAiConversation(
    activeConvId ?? "skip"
  );
  const { data: suggestionsData } = useListAiSuggestedQuestions();

  const { mutate: createConv, isPending: isCreating } = useCreateAiConversation({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
        setActiveConvId(data.id ?? null);
      },
    },
  });

  const { mutate: deleteConv } = useDeleteAiConversation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
        setActiveConvId(null);
        toast({ title: "Conversation deleted" });
      },
    },
  });

  const { mutate: sendMessage, isPending: isSending } = useSendAiMessage({
    mutation: {
      onMutate: () => setIsTyping(true),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/ai/conversations/${activeConvId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
        setInput("");
        setIsTyping(false);
      },
      onError: () => setIsTyping(false),
    },
  });

  const conversations = convsData?.items ?? [];
  const messages = (activeConv as unknown as { messages?: Array<{ id: string; role: string; content: string; createdAt: string }> })?.messages ?? [];
  const suggestions = suggestionsData?.items ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = (content?: string) => {
    const text = content ?? input;
    if (!text.trim() || !activeConvId) return;
    setInput("");
    sendMessage({ id: activeConvId, data: { content: text } });
  };

  const handleNewConversation = () => {
    createConv();
  };

  return (
    <div className="flex h-[calc(100vh-130px)] gap-0 overflow-hidden rounded-xl border bg-white">
      <div className="w-64 flex-col border-r bg-gray-50 hidden md:flex">
        <div className="p-4 border-b">
          <Button
            onClick={handleNewConversation}
            disabled={isCreating}
            className="w-full gap-2"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {convsLoading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-200 rounded animate-pulse" />)}
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No conversations yet</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group transition-colors",
                    activeConvId === conv.id ? "bg-white border shadow-sm" : "hover:bg-white hover:border hover:shadow-sm"
                  )}
                  onClick={() => setActiveConvId(conv.id ?? null)}
                >
                  <MessageSquare className={cn("w-3.5 h-3.5 shrink-0", activeConvId === conv.id ? "text-primary" : "text-gray-400")} />
                  <span className="text-sm text-gray-700 flex-1 truncate">{conv.title}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={(e) => { e.stopPropagation(); conv.id && deleteConv({ id: conv.id }); }}
                  >
                    <Trash2 className="w-3 h-3 text-gray-400" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {!activeConvId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">HaloLight AI Assistant</h2>
            <p className="text-gray-500 max-w-sm mb-6 text-sm">
              Your intelligent assistant for HaloLight operations. Ask about pricing, bookings, equipment, and more.
            </p>
            <Button onClick={handleNewConversation} disabled={isCreating} className="gap-2 mb-8">
              <Plus className="w-4 h-4" />
              Start New Conversation
            </Button>
            {suggestions.length > 0 && (
              <div className="w-full max-w-md">
                <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide">Suggested Questions</p>
                <div className="grid gap-2">
                  {suggestions.slice(0, 6).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { handleNewConversation(); }}
                      className="text-left text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 px-4 py-2.5 rounded-lg transition-colors"
                    >
                      {s.question}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                <span className="font-medium text-gray-800">{activeConv?.title ?? "AI Assistant"}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-red-500 gap-1 text-xs"
                onClick={() => activeConvId && deleteConv({ id: activeConvId })}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
              {convLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <Bot className="w-10 h-10 text-gray-300 mb-3" />
                  <p className="text-gray-500 text-sm mb-4">Ask me anything about HaloLight</p>
                  {suggestions.length > 0 && (
                    <div className="grid gap-2 max-w-sm w-full">
                      {suggestions.slice(0, 4).map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleSend(s.question)}
                          className="text-left text-sm text-gray-600 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 px-3 py-2 rounded-lg border hover:border-blue-200 transition-colors"
                        >
                          {s.question}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 max-w-2xl mx-auto">
                  {messages.map((msg) => (
                    <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "")}>
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                        msg.role === "user" ? "bg-primary text-white" : "bg-gradient-to-br from-violet-500 to-primary text-white"
                      )}>
                        {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className={cn("flex-1 max-w-[75%]", msg.role === "user" ? "flex flex-col items-end" : "")}>
                        <div className={cn(
                          "rounded-2xl px-4 py-3 text-sm",
                          msg.role === "user"
                            ? "bg-primary text-white rounded-tr-none"
                            : "bg-gray-100 text-gray-800 rounded-tl-none"
                        )}>
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        </div>
                        <p className={cn("text-xs text-gray-400 mt-1", msg.role === "user" ? "text-right" : "")}>
                          {formatTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-primary text-white flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="bg-gray-100 rounded-2xl rounded-tl-none px-4 py-3">
                        <div className="flex gap-1 items-center h-4">
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <div className="p-4 border-t">
              <div className="flex gap-2 max-w-2xl mx-auto">
                <Input
                  placeholder="Ask me anything..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  disabled={isSending}
                  className="flex-1"
                />
                <Button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isSending}
                  size="icon"
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-400 text-center mt-2">
                AI responses are generated based on HaloLight knowledge base. No external API used.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

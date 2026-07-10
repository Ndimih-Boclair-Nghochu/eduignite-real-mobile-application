"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Send } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { aiService } from "@/lib/api/services/ai.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

const AI_AVATAR = "/icons/eduignite-icon-512.png";

const QUICK_TOPICS = [
  { label: "My Subjects", prompt: "Help me understand my registered subjects and optional subjects." },
  { label: "My Grades", prompt: "Explain my grades and how my average is calculated." },
  { label: "Attendance", prompt: "Explain my attendance record and what I should improve." },
  { label: "Library", prompt: "How do I request a physical book or open a digital copy?" },
  { label: "Exams", prompt: "How do I view my exam results and prepare better?" },
  { label: "Subscription", prompt: "Explain my current subscription or school fee status." },
  { label: "Chat", prompt: "Who can I contact from my account and how does student messaging work?" },
  { label: "Live Classes", prompt: "How do live classes work from the student dashboard?" },
];

const timeOfDay = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function AiAssistantPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Hi${user?.name ? ` ${user.name.split(" ")[0]}` : ""}! I'm your EduIgnite assistant. Ask me about your courses, grades, attendance, messaging, fees, or how to use your tools.`,
      ts: Date.now(),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const conversationHistory = useMemo(
    () => chatMessages.slice(-10).map((entry) => ({ role: entry.role, content: entry.content })),
    [chatMessages]
  );
  const quickRoutes = useMemo(() => {
    const routes = [
      { label: "Career Orientation", href: "/dashboard/career-orientation" },
      { label: "Skill Gap Analysis", href: "/dashboard/grades/skill-gap" },
    ];
    if (["TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN"].includes(user?.role || "")) {
      routes.push({ label: "Generate Exam (AI)", href: "/dashboard/exams/ai-generator" });
    }
    return routes;
  }, [user?.role]);

  const scrollToBottom = () => {
    window.setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, 80);
  };

  const sendMessage = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || isTyping) {
        return;
      }

      const nextMessages = [...chatMessages, { role: "user" as const, content: message, ts: Date.now() }];
      setChatMessages(nextMessages);
      setChatInput("");
      setIsTyping(true);
      scrollToBottom();

      try {
        const response = await aiService.directChat(
          message,
          nextMessages.slice(-10).map((entry) => ({ role: entry.role, content: entry.content }))
        );
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: response.reply, ts: Date.now() },
        ]);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Assistant unavailable",
          description: getApiErrorMessage(error, "The assistant could not respond right now. Please try again shortly."),
        });
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I could not process that request right now. Please try again in a moment.",
            ts: Date.now(),
          },
        ]);
      } finally {
        setIsTyping(false);
        scrollToBottom();
      }
    },
    [chatMessages, isTyping, toast]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(chatInput);
    }
  };

  const renderContent = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={index}>{part}</span>
      )
    );
  };

  return (
    <div className="flex h-[calc(100dvh-172px)] flex-col overflow-hidden rounded-3xl bg-[#ece7f6] shadow-sm ring-1 ring-black/[0.04]">
      {/* WhatsApp-style branded header */}
      <div className="flex shrink-0 items-center gap-3 bg-primary px-4 py-3 text-white shadow-md">
        <Avatar className="h-10 w-10 border-2 border-white/30 bg-white">
          <AvatarImage src={AI_AVATAR} className="object-contain p-0.5" />
          <AvatarFallback className="bg-white font-black text-primary">AI</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-black leading-tight">EduIgnite AI</p>
          <p className="flex items-center gap-1 text-[11px] text-white/70">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {isTyping ? "typing…" : "online • powered by your school data"}
          </p>
        </div>
      </div>

      {/* messages */}
      <div ref={chatScrollRef} className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {chatMessages.map((message, index) => {
          const isOwn = message.role === "user";
          const previous = chatMessages[index - 1];
          const showAvatar = !isOwn && (!previous || previous.role !== "assistant");
          return (
            <div
              key={`${message.ts}-${index}`}
              className={cn("flex items-end gap-2", isOwn ? "justify-end" : "justify-start")}
            >
              {!isOwn && (
                <Avatar className={cn("h-7 w-7 shrink-0 bg-white shadow-sm", !showAvatar && "invisible")}>
                  <AvatarImage src={AI_AVATAR} className="object-contain p-0.5" />
                  <AvatarFallback className="text-[10px] font-black text-primary">AI</AvatarFallback>
                </Avatar>
              )}
              <div
                className={cn(
                  "max-w-[82%] rounded-2xl px-3 py-2 shadow-sm",
                  isOwn
                    ? "rounded-br-md bg-primary text-white"
                    : "rounded-bl-md bg-white text-foreground"
                )}
              >
                <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.45]">
                  {renderContent(message.content)}
                </p>
                <span
                  className={cn(
                    "mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none",
                    isOwn ? "text-white/70" : "text-muted-foreground"
                  )}
                >
                  {timeOfDay(message.ts)}
                  {isOwn && <Check className="h-3 w-3" />}
                </span>
              </div>
            </div>
          );
        })}

        {isTyping ? (
          <div className="flex items-end gap-2">
            <Avatar className="h-7 w-7 shrink-0 bg-white shadow-sm">
              <AvatarImage src={AI_AVATAR} className="object-contain p-0.5" />
              <AvatarFallback className="text-[10px] font-black text-primary">AI</AvatarFallback>
            </Avatar>
            <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/40 [animation-delay:240ms]" />
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* quick topics + composer */}
      <div className="shrink-0 px-2 pb-2 pt-1">
        <div className="-mx-1 mb-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {quickRoutes.map((topic) => (
            <button
              key={topic.href}
              onClick={() => router.push(topic.href)}
              className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-primary shadow-sm ring-1 ring-primary/15"
            >
              {topic.label}
              <ChevronRight className="h-3 w-3" />
            </button>
          ))}
          {QUICK_TOPICS.map((topic) => (
            <button
              key={topic.label}
              onClick={() => void sendMessage(topic.prompt)}
              disabled={isTyping}
              className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-muted-foreground shadow-sm ring-1 ring-black/[0.05]"
            >
              {topic.label}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-1.5">
          <div className="flex min-h-11 flex-1 items-center rounded-full bg-white px-4 shadow-sm">
            <Input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message EduIgnite AI"
              className="h-10 flex-1 border-none bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0"
            />
          </div>
          <Button
            className="h-11 w-11 shrink-0 rounded-full bg-primary text-white shadow-lg"
            size="icon"
            onClick={() => void sendMessage(chatInput)}
            disabled={!chatInput.trim() || isTyping}
            aria-label="Send"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>

        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          Your last {conversationHistory.length} messages are used as context.
        </p>
      </div>
    </div>
  );
}

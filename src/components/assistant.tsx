import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sendAssistantMessage } from "@/lib/assistant.functions";
import { MessageCircle, X, Send, History, Plus } from "lucide-react";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Can I afford a new car at R5,000/month?",
  "How long until I reach my emergency fund goal?",
  "What should I cut to save an extra R1,000/month?",
  "Am I in a good position to apply for credit right now?",
];

export function AssistantLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Budge Assistant"
        className="fixed bottom-20 right-5 z-40 hidden size-14 place-items-center rounded-full bg-accent text-background shadow-[0_10px_30px_-8px_color-mix(in_oklab,var(--accent)_70%,transparent)] transition hover:scale-105 md:bottom-6 md:grid"
      >
        <MessageCircle className="size-6" strokeWidth={2.2} />
      </button>
      {open && <AssistantPanel onClose={() => setOpen(false)} />}
    </>
  );
}

/** Mobile bottom-nav entry point. */
export function AssistantTabButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground transition-colors"
      >
        <MessageCircle className="size-[18px]" />
        Assistant
      </button>
      {open && <AssistantPanel onClose={() => setOpen(false)} />}
    </>
  );
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [] } = useQuery({
    queryKey: ["assistant_conversations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("assistant_conversations")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
        .limit(25);
      return data ?? [];
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function openConversation(id: string) {
    const { data } = await supabase
      .from("assistant_messages")
      .select("role, content")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    setConversationId(id);
    setMessages((data ?? []) as Msg[]);
    setShowHistory(false);
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await sendAssistantMessage({ data: { conversationId, message: text } });
      setConversationId(res.conversationId ?? null);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      qc.invalidateQueries({ queryKey: ["assistant_conversations"] });
    } catch (e: any) {
      toast.error(e?.message ?? "The assistant couldn't answer just then.");
      setMessages((m) => m.slice(0, -1));
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="mt-auto flex h-[86vh] w-full flex-col border-l border-hairline bg-background md:mt-0 md:h-full md:w-[420px] rounded-t-2xl md:rounded-none animate-enter"
      >
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div>
            <p className="text-[14px] font-semibold">Budge Assistant</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              Knows your numbers
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setConversationId(null);
                setMessages([]);
                setShowHistory(false);
              }}
              className="btn-ghost !p-2"
              title="New conversation"
            >
              <Plus className="size-4" />
            </button>
            <button onClick={() => setShowHistory((s) => !s)} className="btn-ghost !p-2" title="History">
              <History className="size-4" />
            </button>
            <button onClick={onClose} className="btn-ghost !p-2">
              <X className="size-4" />
            </button>
          </div>
        </header>

        {showHistory ? (
          <div className="flex-1 overflow-y-auto p-3">
            {conversations.length === 0 ? (
              <p className="p-4 text-center text-[12px] text-muted-foreground">No previous conversations yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(conversations as any[]).map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => openConversation(c.id)}
                      className="w-full rounded-xl border border-hairline p-3 text-left text-[12px] transition-colors hover:bg-surface-2"
                    >
                      <span className="line-clamp-1 font-medium">{c.title}</span>
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                        {new Date(c.updated_at).toLocaleDateString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Ask me anything about your money — I already have your income, expenses, goals and debts in front of me.
                </p>
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-xl border border-hairline p-3 text-left text-[12.5px] transition-colors hover:border-accent/40 hover:bg-accent/[0.05]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    m.role === "user"
                      ? "self-end bg-accent/15 text-foreground"
                      : "self-start border border-hairline bg-surface-2"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {busy && (
                <div className="self-start rounded-2xl border border-hairline bg-surface-2 px-3.5 py-2.5 text-[13px] text-muted-foreground">
                  Thinking…
                </div>
              )}
            </div>
            <div ref={endRef} />
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-hairline p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your money…"
            className="field flex-1"
          />
          <button type="submit" disabled={busy} className="btn-accent !px-3">
            <Send className="size-4" />
          </button>
        </form>
      </aside>
    </div>
  );
}

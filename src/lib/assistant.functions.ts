import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DAILY_LIMIT = 50;

const SYSTEM_PROMPT = `You are Budge's financial companion — a South African personal finance assistant.
You are given the user's real numbers. Use them. Never give generic advice when you have actual data.
Be direct and clear. Do not preach, do not hedge into uselessness.
When something is a bad idea, say so and give the reason. When something is genuinely affordable, say so plainly.
Do calculations in real time using the injected numbers and show your working briefly (one or two lines) using the user's actual figures.
Amounts are in the user's home currency; South African users see R.
When a recommendation maps to a Budge feature, end with a short handoff line such as
"Want to model this in the Planner?" or "Run this through the Affordability Checker."
Keep answers tight — a few short paragraphs at most. Use markdown sparingly.`;

async function buildContext(supabase: any, userId: string) {
  const [{ data: profile }, { data: expenses }, { data: goals }, { data: debts }, { data: snaps }, { data: scores }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("expenses").select("name, category, amount, frequency, is_fixed").is("deleted_at", null),
      supabase.from("savings_goals").select("name, target_amount, current_amount, target_date, completed_at"),
      supabase.from("debts").select("name, balance, interest_rate, min_payment, account_type"),
      supabase
        .from("monthly_snapshots")
        .select("month, net_income, total_expenses, disposable_income, savings_rate, expenses_by_category")
        .order("month", { ascending: false })
        .limit(3),
      supabase.from("budge_scores").select("month, score").order("month", { ascending: false }).limit(2),
    ]);

  const monthly = (e: any) =>
    e.frequency === "monthly" ? Number(e.amount)
      : e.frequency === "weekly" ? (Number(e.amount) * 52) / 12
        : e.frequency === "yearly" ? Number(e.amount) / 12
          : 0;

  const fixedByCategory: Record<string, number> = {};
  let variable = 0;
  let total = 0;
  for (const e of expenses ?? []) {
    const m = monthly(e);
    total += m;
    if (e.is_fixed) fixedByCategory[e.category] = (fixedByCategory[e.category] ?? 0) + m;
    else variable += m;
  }
  const net = Number(profile?.net_income ?? 0);
  const gross = Number(profile?.gross_income ?? 0);
  const disposable = net - total;
  const debtMonthly = (debts ?? []).reduce((s: number, d: any) => s + Number(d.min_payment ?? 0), 0);

  return {
    currency: profile?.currency_code ?? "ZAR",
    net_income: net,
    gross_income: gross,
    fixed_expenses_by_category: fixedByCategory,
    total_variable_expenses: Math.round(variable),
    total_expenses: Math.round(total),
    disposable_income: Math.round(disposable),
    savings_rate_pct: net > 0 ? Math.round((disposable / net) * 100) : 0,
    debt_to_income_pct: gross > 0 ? Math.round((debtMonthly / gross) * 100) : 0,
    debts: debts ?? [],
    goals: goals ?? [],
    budge_score: scores?.[0]?.score ?? null,
    previous_budge_score: scores?.[1]?.score ?? null,
    recent_snapshots: snaps ?? [],
    safety_buffer_pct: profile?.safety_buffer_pct ?? 10,
  };
}

export const sendAssistantMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ conversationId: z.string().uuid().nullable(), message: z.string().min(1).max(4000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    // Rate limit — 50 user messages per calendar day, resets at midnight.
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("assistant_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", since.toISOString());
    if ((count ?? 0) >= DAILY_LIMIT) {
      return {
        limited: true as const,
        reply:
          "You've hit today's limit of 50 assistant messages. It resets at midnight — everything else in Budge keeps working in the meantime.",
        conversationId: data.conversationId,
      };
    }

    let conversationId = data.conversationId;
    if (!conversationId) {
      const { data: conv, error } = await supabase
        .from("assistant_conversations")
        .insert({ user_id: userId, title: data.message.slice(0, 60) })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      conversationId = conv.id as string;
    }

    await supabase
      .from("assistant_messages")
      .insert({ conversation_id: conversationId, user_id: userId, role: "user", content: data.message });

    const { data: history } = await supabase
      .from("assistant_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(40);

    const ctx = await buildContext(supabase, userId);

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: `The user's current financial context (JSON):\n${JSON.stringify(ctx)}` },
          ...(history ?? []).map((m: any) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("The assistant is busy right now — try again in a moment.");
      if (res.status === 402) throw new Error("The AI credits for this app have run out. Add credits to keep chatting.");
      throw new Error(`Assistant unavailable (${res.status}): ${body.slice(0, 200)}`);
    }

    const json: any = await res.json();
    const reply: string = json?.choices?.[0]?.message?.content ?? "Sorry, I couldn't put an answer together just then.";

    await supabase
      .from("assistant_messages")
      .insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content: reply });
    await supabase
      .from("assistant_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return { limited: false as const, reply, conversationId, remaining: DAILY_LIMIT - ((count ?? 0) + 1) };
  });

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useUpdateProfile } from "@/hooks/use-profile";
import { invitePartner } from "@/lib/household.functions";
import { toast } from "sonner";
import { Users, Mail, Link2Off, Loader2 } from "lucide-react";

export type HouseholdState = {
  householdId: string | null;
  memberIds: string[];
  partnerId: string | null;
  invites: { id: string; email: string; status: string; household_id: string; invited_by: string }[];
};

export function useHousehold() {
  return useQuery({
    queryKey: ["household"],
    queryFn: async (): Promise<HouseholdState> => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      const { data: members } = await supabase.from("household_members").select("household_id, user_id");
      const mine = (members ?? []).find((m: any) => m.user_id === uid);
      const householdId = (mine?.household_id as string) ?? null;
      const memberIds = (members ?? []).map((m: any) => m.user_id as string);
      const { data: invites } = await supabase
        .from("household_invites")
        .select("id, email, status, household_id, invited_by")
        .eq("status", "pending");
      return {
        householdId,
        memberIds,
        partnerId: memberIds.find((id) => id !== uid) ?? null,
        invites: (invites ?? []) as any,
      };
    },
  });
}

export function HouseholdSection() {
  const { data: profile } = useProfile();
  const { data: household } = useHousehold();
  const update = useUpdateProfile();
  const qc = useQueryClient();
  const invite = useServerFn(invitePartner);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const linked = !!household?.partnerId;
  const pendingIncoming = (household?.invites ?? []).filter((i) => i.household_id !== household?.householdId);
  const pendingOutgoing = (household?.invites ?? []).filter((i) => i.household_id === household?.householdId);

  async function send() {
    if (!email) return toast.error("Enter your partner's email");
    setSending(true);
    try {
      await invite({ data: { email, redirectTo: `${window.location.origin}/auth` } });
      setEmail("");
      qc.invalidateQueries({ queryKey: ["household"] });
      toast.success("Invite sent");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't send the invite");
    } finally {
      setSending(false);
    }
  }

  async function join(inviteId: string, householdId: string) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("household_members").insert({ household_id: householdId, user_id: u.user.id });
    if (error) return toast.error(error.message);
    await supabase.from("household_invites").update({ status: "accepted" }).eq("id", inviteId);
    qc.invalidateQueries({ queryKey: ["household"] });
    toast.success("Household linked");
  }

  async function unlink() {
    if (!household?.householdId) return;
    const { error } = await supabase.from("household_members").delete().eq("household_id", household.householdId);
    if (error) return toast.error(error.message);
    await update.mutateAsync({ household_view: false });
    qc.invalidateQueries({ queryKey: ["household"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    toast.success("Household unlinked — both accounts are back to individual view");
  }

  return (
    <div className="space-y-4">
      <p className="-mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="size-3.5" /> Link one partner and switch between your own numbers and your combined household.
      </p>

      {linked ? (
        <>
          <div className="panel flex items-center justify-between gap-4 p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Household linked</div>
              <div className="text-[11px] text-muted-foreground">Two accounts sharing a combined view.</div>
            </div>
            <button type="button" onClick={unlink} className="btn-ghost text-alert">
              <Link2Off className="size-3.5" /> Unlink
            </button>
          </div>
          <div className="panel flex items-center justify-between gap-4 p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Household view</div>
              <div className="text-[11px] text-muted-foreground">
                Combine both incomes and expenses across the app. Off means only your own figures.
              </div>
            </div>
            <button
              type="button"
              onClick={() => update.mutate({ household_view: !profile?.household_view })}
              className={`relative h-6 w-10 shrink-0 rounded-full transition ${profile?.household_view ? "bg-accent" : "bg-muted"}`}
            >
              <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-background shadow transition-transform ${profile?.household_view ? "translate-x-4" : ""}`} />
            </button>
          </div>
        </>
      ) : (
        <>
          {pendingIncoming.map((i) => (
            <div key={i.id} className="panel flex items-center justify-between gap-4 p-3">
              <div className="text-sm">You've been invited to join a household.</div>
              <button type="button" onClick={() => join(i.id, i.household_id)} className="btn-accent">Join</button>
            </div>
          ))}
          {pendingOutgoing.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              Invite pending for {pendingOutgoing.map((i) => i.email).join(", ")}.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="partner@email.com"
              className="field flex-1"
            />
            <button type="button" onClick={send} disabled={sending} className="btn-accent justify-center">
              {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Invite partner
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            They'll get an email to create their own Budge account. Until you both switch to Household view, neither of
            you can see the other's individual breakdown.
          </p>
        </>
      )}
    </div>
  );
}

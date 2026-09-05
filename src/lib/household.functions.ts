import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Invite one partner by email. Creates the household if the caller doesn't have
 * one yet, records the invite and sends a Supabase auth invite email.
 */
export const invitePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ email: z.string().email(), redirectTo: z.string().url() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existingMember } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .maybeSingle();

    let householdId = existingMember?.household_id as string | undefined;

    if (!householdId) {
      const { data: created, error: hErr } = await supabase
        .from("households")
        .insert({ owner_id: userId })
        .select("id")
        .single();
      if (hErr) throw new Error(hErr.message);
      householdId = created.id as string;
      const { error: mErr } = await supabase
        .from("household_members")
        .insert({ household_id: householdId, user_id: userId });
      if (mErr) throw new Error(mErr.message);
    }

    const { error: iErr } = await supabase
      .from("household_invites")
      .insert({ household_id: householdId, invited_by: userId, email: data.email.toLowerCase(), status: "pending" });
    if (iErr) throw new Error(iErr.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: sendErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: data.redirectTo,
    });
    // An existing Budge account can't be re-invited — that's fine, they just sign in.
    const alreadyRegistered = sendErr?.message?.toLowerCase().includes("already");
    if (sendErr && !alreadyRegistered) throw new Error(sendErr.message);

    return { householdId, emailSent: !sendErr };
  });

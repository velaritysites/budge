import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TaxProfile = {
  id?: string;
  user_id?: string;
  employment_type: "salaried" | "freelance" | "both" | "director";
  is_provisional_taxpayer: "yes" | "no" | "unsure";
  home_office_enabled: "full" | "partial" | "no";
  home_office_area_m2: number;
  home_total_area_m2: number;
  has_travel_allowance: boolean;
  has_company_car: boolean;
  has_ra: boolean;
  ra_provider: string | null;
  has_investment_income: boolean;
  age: number;
};

export const DEFAULT_TAX_PROFILE: TaxProfile = {
  employment_type: "salaried",
  is_provisional_taxpayer: "no",
  home_office_enabled: "no",
  home_office_area_m2: 0,
  home_total_area_m2: 0,
  has_travel_allowance: false,
  has_company_car: false,
  has_ra: false,
  ra_provider: null,
  has_investment_income: false,
  age: 30,
};

export function useTaxProfile() {
  return useQuery({
    queryKey: ["tax_profile"],
    queryFn: async (): Promise<TaxProfile | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("tax_profile")
        .select("*")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...(data as any),
        home_office_area_m2: Number((data as any).home_office_area_m2 ?? 0),
        home_total_area_m2: Number((data as any).home_total_area_m2 ?? 0),
        age: Number((data as any).age ?? 30),
      } as TaxProfile;
    },
  });
}

export function useSaveTaxProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profile: TaxProfile) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { id, user_id, ...rest } = profile as any;
      const { error } = await supabase
        .from("tax_profile")
        .upsert({ ...rest, user_id: u.user.id }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax_profile"] }),
  });
}

export type TaxYearData = {
  tax_year: string;
  ra_contributions: number;
  medical_aid_contributions: number;
  home_office_deduction: number;
  travel_deduction: number;
  business_km: number;
  donations: number;
  professional_development: number;
};

export function useTaxYearData(taxYearLabel: string) {
  return useQuery({
    queryKey: ["tax_year_data", taxYearLabel],
    queryFn: async (): Promise<TaxYearData | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("tax_year_data")
        .select("*")
        .eq("user_id", u.user.id)
        .eq("tax_year", taxYearLabel)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const d = data as any;
      return {
        tax_year: d.tax_year,
        ra_contributions: Number(d.ra_contributions ?? 0),
        medical_aid_contributions: Number(d.medical_aid_contributions ?? 0),
        home_office_deduction: Number(d.home_office_deduction ?? 0),
        travel_deduction: Number(d.travel_deduction ?? 0),
        business_km: Number(d.business_km ?? 0),
        donations: Number(d.donations ?? 0),
        professional_development: Number(d.professional_development ?? 0),
      };
    },
  });
}

/** Writes the running deduction totals for a tax year. */
export function useSaveTaxYearData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<TaxYearData> & { tax_year: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("tax_year_data")
        .upsert({ ...row, user_id: u.user.id }, { onConflict: "user_id,tax_year" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["tax_year_data", vars.tax_year] }),
  });
}

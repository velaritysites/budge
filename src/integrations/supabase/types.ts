export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      affordability_checks: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          disposable_at_check: number
          id: string
          is_recurring: boolean
          item_name: string
          reasoning: string
          user_id: string
          verdict: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency_code?: string
          disposable_at_check?: number
          id?: string
          is_recurring?: boolean
          item_name: string
          reasoning: string
          user_id: string
          verdict: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          disposable_at_check?: number
          id?: string
          is_recurring?: boolean
          item_name?: string
          reasoning?: string
          user_id?: string
          verdict?: string
        }
        Relationships: []
      }
      assistant_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assistant_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "assistant_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_samples: {
        Row: {
          category_pcts: Json
          created_at: string
          id: string
          income_bracket: string
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_pcts?: Json
          created_at?: string
          id?: string
          income_bracket: string
          month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_pcts?: Json
          created_at?: string
          id?: string
          income_bracket?: string
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budge_scores: {
        Row: {
          created_at: string
          factors: Json
          id: string
          month: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          factors?: Json
          id?: string
          month: string
          score: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          factors?: Json
          id?: string
          month?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bureau_scores: {
        Row: {
          bureau: string
          created_at: string
          estimated_score: number | null
          factors: Json
          gap: number | null
          id: string
          reported_on: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bureau: string
          created_at?: string
          estimated_score?: number | null
          factors?: Json
          gap?: number | null
          id?: string
          reported_on?: string
          score: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bureau?: string
          created_at?: string
          estimated_score?: number | null
          factors?: Json
          gap?: number | null
          id?: string
          reported_on?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      debts: {
        Row: {
          account_type: string
          balance: number
          created_at: string
          id: string
          interest_rate: number
          min_payment: number
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: string
          balance?: number
          created_at?: string
          id?: string
          interest_rate?: number
          min_payment?: number
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          balance?: number
          created_at?: string
          id?: string
          interest_rate?: number
          min_payment?: number
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          deleted_at: string | null
          due_day: number | null
          exchange_rate: number | null
          frequency: string
          id: string
          is_fixed: boolean
          name: string
          notify_enabled: boolean
          notify_lead_days: number
          original_amount: number | null
          original_currency: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          deleted_at?: string | null
          due_day?: number | null
          exchange_rate?: number | null
          frequency?: string
          id?: string
          is_fixed?: boolean
          name: string
          notify_enabled?: boolean
          notify_lead_days?: number
          original_amount?: number | null
          original_currency?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          deleted_at?: string | null
          due_day?: number | null
          exchange_rate?: number | null
          frequency?: string
          id?: string
          is_fixed?: boolean
          name?: string
          notify_enabled?: boolean
          notify_lead_days?: number
          original_amount?: number | null
          original_currency?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goal_contributions: {
        Row: {
          amount: number
          created_at: string
          goal_id: string
          id: string
          note: string | null
          occurred_on: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          goal_id: string
          id?: string
          note?: string | null
          occurred_on?: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          goal_id?: string
          id?: string
          note?: string | null
          occurred_on?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          created_at: string
          email: string
          household_id: string
          id: string
          invited_by: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          household_id: string
          id?: string
          invited_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          household_id?: string
          id?: string
          invited_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          household_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      income_streams: {
        Row: {
          created_at: string
          frequency: string
          gross_amount: number
          id: string
          is_active: boolean
          name: string
          net_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          frequency?: string
          gross_amount?: number
          id?: string
          is_active?: boolean
          name: string
          net_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          frequency?: string
          gross_amount?: number
          id?: string
          is_active?: boolean
          name?: string
          net_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      monthly_briefings: {
        Row: {
          created_at: string
          id: string
          month: string
          observations: Json
          recommendation: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          observations?: Json
          recommendation?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          month?: string
          observations?: Json
          recommendation?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      monthly_snapshots: {
        Row: {
          assets_total: number | null
          close_notes: string | null
          created_at: string
          currency_code: string
          disposable_income: number
          expenses_by_category: Json
          gross_income: number
          id: string
          liabilities_total: number | null
          locked_at: string | null
          month: string
          net_income: number
          net_worth: number | null
          savings_rate: number
          total_expenses: number
          updated_at: string
          user_id: string
        }
        Insert: {
          assets_total?: number | null
          close_notes?: string | null
          created_at?: string
          currency_code?: string
          disposable_income?: number
          expenses_by_category?: Json
          gross_income?: number
          id?: string
          liabilities_total?: number | null
          locked_at?: string | null
          month: string
          net_income?: number
          net_worth?: number | null
          savings_rate?: number
          total_expenses?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          assets_total?: number | null
          close_notes?: string | null
          created_at?: string
          currency_code?: string
          disposable_income?: number
          expenses_by_category?: Json
          gross_income?: number
          id?: string
          liabilities_total?: number | null
          locked_at?: string | null
          month?: string
          net_income?: number
          net_worth?: number | null
          savings_rate?: number
          total_expenses?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      net_worth_items: {
        Row: {
          category: string
          created_at: string
          depreciation_pct: number
          id: string
          kind: string
          label: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          category: string
          created_at?: string
          depreciation_pct?: number
          id?: string
          kind: string
          label: string
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          category?: string
          created_at?: string
          depreciation_pct?: number
          id?: string
          kind?: string
          label?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      planner_plans: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          phases: Json
          tax_rate_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phases?: Json
          tax_rate_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phases?: Json
          tax_rate_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auto_allocation_mode: string
          auto_contribution_timing: string
          created_at: string
          currency_code: string
          debt_extra_payment: number
          debt_strategy: string | null
          display_name: string | null
          email_notifications: boolean
          gross_income: number
          household_view: boolean
          id: string
          multi_currency_enabled: boolean
          net_income: number
          onboarded_at: string | null
          pay_frequency: string
          provisional_taxpayer: boolean
          push_notifications: boolean
          push_token: string | null
          safety_buffer_pct: number
          updated_at: string
          works_from_home: boolean
        }
        Insert: {
          auto_allocation_mode?: string
          auto_contribution_timing?: string
          created_at?: string
          currency_code?: string
          debt_extra_payment?: number
          debt_strategy?: string | null
          display_name?: string | null
          email_notifications?: boolean
          gross_income?: number
          household_view?: boolean
          id: string
          multi_currency_enabled?: boolean
          net_income?: number
          onboarded_at?: string | null
          pay_frequency?: string
          provisional_taxpayer?: boolean
          push_notifications?: boolean
          push_token?: string | null
          safety_buffer_pct?: number
          updated_at?: string
          works_from_home?: boolean
        }
        Update: {
          auto_allocation_mode?: string
          auto_contribution_timing?: string
          created_at?: string
          currency_code?: string
          debt_extra_payment?: number
          debt_strategy?: string | null
          display_name?: string | null
          email_notifications?: boolean
          gross_income?: number
          household_view?: boolean
          id?: string
          multi_currency_enabled?: boolean
          net_income?: number
          onboarded_at?: string | null
          pay_frequency?: string
          provisional_taxpayer?: boolean
          push_notifications?: boolean
          push_token?: string | null
          safety_buffer_pct?: number
          updated_at?: string
          works_from_home?: boolean
        }
        Relationships: []
      }
      savings_goals: {
        Row: {
          completed_at: string | null
          created_at: string
          current_amount: number
          id: string
          last_auto_period: string | null
          name: string
          priority: number
          progress_mode: string
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_amount?: number
          id?: string
          last_auto_period?: string | null
          name: string
          priority?: number
          progress_mode?: string
          target_amount: number
          target_date?: string | null
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_amount?: number
          id?: string
          last_auto_period?: string | null
          name?: string
          priority?: number
          progress_mode?: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      score_calibration: {
        Row: {
          bureau: string
          created_at: string
          dti: number
          estimated_score: number
          expense_consistency: number
          gap: number
          id: string
          payment_consistency: number
          real_score: number
          reported_on: string
          savings_rate: number
          user_id: string
          utilisation: number
        }
        Insert: {
          bureau: string
          created_at?: string
          dti?: number
          estimated_score: number
          expense_consistency?: number
          gap: number
          id?: string
          payment_consistency?: number
          real_score: number
          reported_on?: string
          savings_rate?: number
          user_id: string
          utilisation?: number
        }
        Update: {
          bureau?: string
          created_at?: string
          dti?: number
          estimated_score?: number
          expense_consistency?: number
          gap?: number
          id?: string
          payment_consistency?: number
          real_score?: number
          reported_on?: string
          savings_rate?: number
          user_id?: string
          utilisation?: number
        }
        Relationships: []
      }
      score_corrections: {
        Row: {
          corrections: Json
          id: number
          mean_abs_gap: number
          mean_gap: number
          sample_size: number
          updated_at: string
        }
        Insert: {
          corrections?: Json
          id?: number
          mean_abs_gap?: number
          mean_gap?: number
          sample_size?: number
          updated_at?: string
        }
        Update: {
          corrections?: Json
          id?: number
          mean_abs_gap?: number
          mean_gap?: number
          sample_size?: number
          updated_at?: string
        }
        Relationships: []
      }
      spending_alerts: {
        Row: {
          amount: number
          average: number
          category: string
          created_at: string
          dismissed_at: string | null
          id: string
          pct_above: number
          period: string
          user_id: string
        }
        Insert: {
          amount?: number
          average?: number
          category: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          pct_above?: number
          period: string
          user_id: string
        }
        Update: {
          amount?: number
          average?: number
          category?: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          pct_above?: number
          period?: string
          user_id?: string
        }
        Relationships: []
      }
      spending_benchmarks: {
        Row: {
          avg_pct: number
          category: string
          id: string
          income_bracket: string
          sample_size: number
          updated_at: string
        }
        Insert: {
          avg_pct?: number
          category: string
          id?: string
          income_bracket: string
          sample_size?: number
          updated_at?: string
        }
        Update: {
          avg_pct?: number
          category?: string
          id?: string
          income_bracket?: string
          sample_size?: number
          updated_at?: string
        }
        Relationships: []
      }
      statement_analyses: {
        Row: {
          bank: string
          category_totals: Json
          created_at: string
          id: string
          statement_month: string | null
          subscription_items: Json
          total_income: number
          total_spent: number
          user_id: string
        }
        Insert: {
          bank: string
          category_totals?: Json
          created_at?: string
          id?: string
          statement_month?: string | null
          subscription_items?: Json
          total_income?: number
          total_spent?: number
          user_id: string
        }
        Update: {
          bank?: string
          category_totals?: Json
          created_at?: string
          id?: string
          statement_month?: string | null
          subscription_items?: Json
          total_income?: number
          total_spent?: number
          user_id?: string
        }
        Relationships: []
      }
      subscription_reviews: {
        Row: {
          created_at: string
          id: string
          marked: boolean
          service_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marked?: boolean
          service_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marked?: boolean
          service_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      my_household_id: { Args: never; Returns: string }
      refresh_spending_benchmarks: { Args: never; Returns: undefined }
      shares_household_with: { Args: { _other: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

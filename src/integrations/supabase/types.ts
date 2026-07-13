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
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          deleted_at: string | null
          due_day: number | null
          frequency: string
          id: string
          is_fixed: boolean
          name: string
          notify_enabled: boolean
          notify_lead_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          deleted_at?: string | null
          due_day?: number | null
          frequency?: string
          id?: string
          is_fixed?: boolean
          name: string
          notify_enabled?: boolean
          notify_lead_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          deleted_at?: string | null
          due_day?: number | null
          frequency?: string
          id?: string
          is_fixed?: boolean
          name?: string
          notify_enabled?: boolean
          notify_lead_days?: number
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
      monthly_snapshots: {
        Row: {
          created_at: string
          currency_code: string
          disposable_income: number
          expenses_by_category: Json
          gross_income: number
          id: string
          month: string
          net_income: number
          savings_rate: number
          total_expenses: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          disposable_income?: number
          expenses_by_category?: Json
          gross_income?: number
          id?: string
          month: string
          net_income?: number
          savings_rate?: number
          total_expenses?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          disposable_income?: number
          expenses_by_category?: Json
          gross_income?: number
          id?: string
          month?: string
          net_income?: number
          savings_rate?: number
          total_expenses?: number
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
          display_name: string | null
          email_notifications: boolean
          gross_income: number
          id: string
          net_income: number
          onboarded_at: string | null
          pay_frequency: string
          push_notifications: boolean
          push_token: string | null
          safety_buffer_pct: number
          updated_at: string
        }
        Insert: {
          auto_allocation_mode?: string
          auto_contribution_timing?: string
          created_at?: string
          currency_code?: string
          display_name?: string | null
          email_notifications?: boolean
          gross_income?: number
          id: string
          net_income?: number
          onboarded_at?: string | null
          pay_frequency?: string
          push_notifications?: boolean
          push_token?: string | null
          safety_buffer_pct?: number
          updated_at?: string
        }
        Update: {
          auto_allocation_mode?: string
          auto_contribution_timing?: string
          created_at?: string
          currency_code?: string
          display_name?: string | null
          email_notifications?: boolean
          gross_income?: number
          id?: string
          net_income?: number
          onboarded_at?: string | null
          pay_frequency?: string
          push_notifications?: boolean
          push_token?: string | null
          safety_buffer_pct?: number
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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

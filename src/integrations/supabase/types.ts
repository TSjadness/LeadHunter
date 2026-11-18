// Database types for the LeadHunter schema (supabase/migrations). Regenerate with:
//   npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      api_integrations: {
        Row: {
          created_at: string
          enabled: boolean
          header_name: string | null
          header_value: string | null
          id: string
          method: string
          name: string
          results_path: string | null
          secret_ciphertext: string | null
          updated_at: string
          url: string
          use_in_search: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          header_name?: string | null
          header_value?: string | null
          id?: string
          method?: string
          name: string
          results_path?: string | null
          secret_ciphertext?: string | null
          updated_at?: string
          url: string
          use_in_search?: boolean
          user_id?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          header_name?: string | null
          header_value?: string | null
          id?: string
          method?: string
          name?: string
          results_path?: string | null
          secret_ciphertext?: string | null
          updated_at?: string
          url?: string
          use_in_search?: boolean
          user_id?: string
        }
        Relationships: []
      }
      collection_leads: {
        Row: {
          collection_id: string
          created_at: string
          lead_id: string
          user_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          lead_id: string
          user_id?: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          lead_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_leads_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      interactions: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: string
          lead_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          kind?: string
          lead_id: string
          user_id?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_status_events: {
        Row: {
          backfilled: boolean
          created_at: string
          from_status: string | null
          id: number
          lead_id: string
          to_status: string
          user_id: string
        }
        Insert: {
          backfilled?: boolean
          created_at?: string
          from_status?: string | null
          id?: number
          lead_id: string
          to_status: string
          user_id: string
        }
        Update: {
          backfilled?: boolean
          created_at?: string
          from_status?: string | null
          id?: number
          lead_id?: string
          to_status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_status_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          city: string | null
          cnae: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          facebook: string | null
          id: string
          instagram: string | null
          lat: number | null
          legal_name: string | null
          linkedin: string | null
          lng: number | null
          name: string
          name_key: string | null
          niche: string | null
          notes: string | null
          phone: string | null
          priority: number
          revenue: number | null
          revenue_source: string | null
          source: string
          source_id: string | null
          state: string | null
          status: string
          status_changed_at: string | null
          trade_name: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          cnae?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          lat?: number | null
          legal_name?: string | null
          linkedin?: string | null
          lng?: number | null
          name: string
          name_key?: never
          niche?: string | null
          notes?: string | null
          phone?: string | null
          priority?: number
          revenue?: number | null
          revenue_source?: string | null
          source?: string
          source_id?: string | null
          state?: string | null
          status?: string
          status_changed_at?: string | null
          trade_name?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          cnae?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          lat?: number | null
          legal_name?: string | null
          linkedin?: string | null
          lng?: number | null
          name?: string
          name_key?: never
          niche?: string | null
          notes?: string | null
          phone?: string | null
          priority?: number
          revenue?: number | null
          revenue_source?: string | null
          source?: string
          source_id?: string | null
          state?: string | null
          status?: string
          status_changed_at?: string | null
          trade_name?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          default_city: string | null
          default_uf: string | null
          providers: Json
          search_guide_dismissed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_city?: string | null
          default_uf?: string | null
          providers?: Json
          search_guide_dismissed?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          default_city?: string | null
          default_uf?: string | null
          providers?: Json
          search_guide_dismissed?: boolean
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
      acquire_provider_slot: {
        Args: { p_interval_ms: number; p_provider: string }
        Returns: number
      }
      consume_rate_limit: {
        Args: { p_bucket: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      lead_dashboard: {
        Args: { p_weeks?: number }
        Returns: Json
      }
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

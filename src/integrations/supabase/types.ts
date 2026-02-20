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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      charge_points: {
        Row: {
          created_at: string
          energy_delivered: number | null
          firmware_version: string | null
          id: string
          last_heartbeat: string | null
          location: string | null
          max_power: number | null
          model: string | null
          name: string
          serial_number: string | null
          status: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          created_at?: string
          energy_delivered?: number | null
          firmware_version?: string | null
          id: string
          last_heartbeat?: string | null
          location?: string | null
          max_power?: number | null
          model?: string | null
          name: string
          serial_number?: string | null
          status?: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          created_at?: string
          energy_delivered?: number | null
          firmware_version?: string | null
          id?: string
          last_heartbeat?: string | null
          location?: string | null
          max_power?: number | null
          model?: string | null
          name?: string
          serial_number?: string | null
          status?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      connectors: {
        Row: {
          charge_point_id: string
          connector_id: number
          created_at: string
          current_power: number | null
          id: number
          meter_value: number | null
          status: string
          updated_at: string
        }
        Insert: {
          charge_point_id: string
          connector_id: number
          created_at?: string
          current_power?: number | null
          id?: number
          meter_value?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          charge_point_id?: string
          connector_id?: number
          created_at?: string
          current_power?: number | null
          id?: number
          meter_value?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connectors_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
      }
      heartbeats: {
        Row: {
          charge_point_id: string
          id: number
          received_at: string
        }
        Insert: {
          charge_point_id: string
          id?: number
          received_at?: string
        }
        Update: {
          charge_point_id?: string
          id?: number
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "heartbeats_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_values: {
        Row: {
          charge_point_id: string
          connector_id: number
          id: number
          measurand: string
          timestamp: string
          transaction_id: number | null
          unit: string
          value: number
        }
        Insert: {
          charge_point_id: string
          connector_id: number
          id?: number
          measurand?: string
          timestamp?: string
          transaction_id?: number | null
          unit?: string
          value: number
        }
        Update: {
          charge_point_id?: string
          connector_id?: number
          id?: number
          measurand?: string
          timestamp?: string
          transaction_id?: number | null
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "meter_values_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_values_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      status_notifications: {
        Row: {
          charge_point_id: string
          connector_id: number
          error_code: string | null
          id: number
          info: string | null
          status: string
          timestamp: string
          vendor_error_code: string | null
        }
        Insert: {
          charge_point_id: string
          connector_id?: number
          error_code?: string | null
          id?: number
          info?: string | null
          status: string
          timestamp?: string
          vendor_error_code?: string | null
        }
        Update: {
          charge_point_id?: string
          connector_id?: number
          error_code?: string | null
          id?: number
          info?: string | null
          status?: string
          timestamp?: string
          vendor_error_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "status_notifications_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          charge_point_id: string
          connector_id: number
          cost: number | null
          created_at: string
          energy_delivered: number | null
          id: number
          id_tag: string
          meter_start: number
          meter_stop: number | null
          start_time: string
          status: string
          stop_time: string | null
        }
        Insert: {
          charge_point_id: string
          connector_id: number
          cost?: number | null
          created_at?: string
          energy_delivered?: number | null
          id?: number
          id_tag: string
          meter_start?: number
          meter_stop?: number | null
          start_time?: string
          status?: string
          stop_time?: string | null
        }
        Update: {
          charge_point_id?: string
          connector_id?: number
          cost?: number | null
          created_at?: string
          energy_delivered?: number | null
          id?: number
          id_tag?: string
          meter_start?: number
          meter_stop?: number | null
          start_time?: string
          status?: string
          stop_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
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

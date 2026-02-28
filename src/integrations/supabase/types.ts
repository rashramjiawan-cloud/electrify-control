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
      authorized_tags: {
        Row: {
          charge_point_ids: string[] | null
          created_at: string
          enabled: boolean
          expiry_date: string | null
          id: string
          id_tag: string
          label: string | null
          updated_at: string
        }
        Insert: {
          charge_point_ids?: string[] | null
          created_at?: string
          enabled?: boolean
          expiry_date?: string | null
          id?: string
          id_tag: string
          label?: string | null
          updated_at?: string
        }
        Update: {
          charge_point_ids?: string[] | null
          created_at?: string
          enabled?: boolean
          expiry_date?: string | null
          id?: string
          id_tag?: string
          label?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      charge_point_config: {
        Row: {
          charge_point_id: string
          created_at: string
          id: number
          key: string
          readonly: boolean
          updated_at: string
          value: string | null
        }
        Insert: {
          charge_point_id: string
          created_at?: string
          id?: number
          key: string
          readonly?: boolean
          updated_at?: string
          value?: string | null
        }
        Update: {
          charge_point_id?: string
          created_at?: string
          id?: number
          key?: string
          readonly?: boolean
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_config_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
      }
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
      charging_behavior_analyses: {
        Row: {
          analysis_date: string
          created_at: string
          id: string
          patterns: Json
          peak_hours: Json
          summary: string | null
          total_energy_kwh: number | null
          transaction_count: number | null
          user_profiles: Json
        }
        Insert: {
          analysis_date?: string
          created_at?: string
          id?: string
          patterns?: Json
          peak_hours?: Json
          summary?: string | null
          total_energy_kwh?: number | null
          transaction_count?: number | null
          user_profiles?: Json
        }
        Update: {
          analysis_date?: string
          created_at?: string
          id?: string
          patterns?: Json
          peak_hours?: Json
          summary?: string | null
          total_energy_kwh?: number | null
          transaction_count?: number | null
          user_profiles?: Json
        }
        Relationships: []
      }
      charging_invoices: {
        Row: {
          charge_point_id: string
          created_at: string
          currency: string
          duration_min: number
          energy_cost: number
          energy_kwh: number
          id: string
          idle_cost: number
          idle_min: number
          notes: string | null
          start_fee: number
          status: string
          tariff_id: string | null
          total_cost: number
          transaction_id: number
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          charge_point_id: string
          created_at?: string
          currency?: string
          duration_min?: number
          energy_cost?: number
          energy_kwh?: number
          id?: string
          idle_cost?: number
          idle_min?: number
          notes?: string | null
          start_fee?: number
          status?: string
          tariff_id?: string | null
          total_cost?: number
          transaction_id: number
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          charge_point_id?: string
          created_at?: string
          currency?: string
          duration_min?: number
          energy_cost?: number
          energy_kwh?: number
          id?: string
          idle_cost?: number
          idle_min?: number
          notes?: string | null
          start_fee?: number
          status?: string
          tariff_id?: string | null
          total_cost?: number
          transaction_id?: number
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charging_invoices_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "charging_tariffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_invoices_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_profiles: {
        Row: {
          active: boolean
          charge_point_id: string
          charging_profile_kind: string
          charging_profile_purpose: string
          charging_schedule_unit: string
          connector_id: number
          created_at: string
          duration: number | null
          id: number
          min_charging_rate: number | null
          recurrency_kind: string | null
          schedule_periods: Json
          stack_level: number
          start_schedule: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          charge_point_id: string
          charging_profile_kind?: string
          charging_profile_purpose?: string
          charging_schedule_unit?: string
          connector_id?: number
          created_at?: string
          duration?: number | null
          id?: number
          min_charging_rate?: number | null
          recurrency_kind?: string | null
          schedule_periods?: Json
          stack_level?: number
          start_schedule?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          charge_point_id?: string
          charging_profile_kind?: string
          charging_profile_purpose?: string
          charging_schedule_unit?: string
          connector_id?: number
          created_at?: string
          duration?: number | null
          id?: number
          min_charging_rate?: number | null
          recurrency_kind?: string | null
          schedule_periods?: Json
          stack_level?: number
          start_schedule?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charging_profiles_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_tariffs: {
        Row: {
          active: boolean
          charge_point_id: string | null
          created_at: string
          currency: string
          id: string
          idle_fee_per_min: number
          is_default: boolean
          name: string
          price_per_kwh: number
          start_fee: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          charge_point_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          idle_fee_per_min?: number
          is_default?: boolean
          name?: string
          price_per_kwh?: number
          start_fee?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          charge_point_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          idle_fee_per_min?: number
          is_default?: boolean
          name?: string
          price_per_kwh?: number
          start_fee?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_tariffs_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
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
      customers: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      energy_meters: {
        Row: {
          auth_pass: string | null
          auth_user: string | null
          connection_type: string
          created_at: string
          device_type: string
          enabled: boolean
          host: string | null
          id: string
          last_poll_at: string | null
          last_reading: Json | null
          meter_type: string
          modbus_address: number | null
          name: string
          poll_interval_sec: number | null
          port: number | null
          updated_at: string
        }
        Insert: {
          auth_pass?: string | null
          auth_user?: string | null
          connection_type?: string
          created_at?: string
          device_type?: string
          enabled?: boolean
          host?: string | null
          id?: string
          last_poll_at?: string | null
          last_reading?: Json | null
          meter_type?: string
          modbus_address?: number | null
          name?: string
          poll_interval_sec?: number | null
          port?: number | null
          updated_at?: string
        }
        Update: {
          auth_pass?: string | null
          auth_user?: string | null
          connection_type?: string
          created_at?: string
          device_type?: string
          enabled?: boolean
          host?: string | null
          id?: string
          last_poll_at?: string | null
          last_reading?: Json | null
          meter_type?: string
          modbus_address?: number | null
          name?: string
          poll_interval_sec?: number | null
          port?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      firmware_updates: {
        Row: {
          charge_point_id: string
          created_at: string
          error_message: string | null
          id: number
          location: string
          retries: number | null
          retrieve_date: string | null
          retry_interval: number | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          charge_point_id: string
          created_at?: string
          error_message?: string | null
          id?: number
          location: string
          retries?: number | null
          retrieve_date?: string | null
          retry_interval?: number | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          charge_point_id?: string
          created_at?: string
          error_message?: string | null
          id?: number
          location?: string
          retries?: number | null
          retrieve_date?: string | null
          retry_interval?: number | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firmware_updates_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
      }
      grid_alert_thresholds: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string
          max_value: number
          metric: string
          min_value: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          max_value: number
          metric: string
          min_value: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          max_value?: number
          metric?: string
          min_value?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      grid_alerts: {
        Row: {
          acknowledged: boolean
          channel: number
          created_at: string
          direction: string
          id: number
          meter_id: string | null
          metric: string
          threshold_max: number
          threshold_min: number
          unit: string
          value: number
        }
        Insert: {
          acknowledged?: boolean
          channel?: number
          created_at?: string
          direction: string
          id?: never
          meter_id?: string | null
          metric: string
          threshold_max: number
          threshold_min: number
          unit?: string
          value: number
        }
        Update: {
          acknowledged?: boolean
          channel?: number
          created_at?: string
          direction?: string
          id?: never
          meter_id?: string | null
          metric?: string
          threshold_max?: number
          threshold_min?: number
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "grid_alerts_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "energy_meters"
            referencedColumns: ["id"]
          },
        ]
      }
      gtv_exceedances: {
        Row: {
          created_at: string
          direction: string
          duration_sec: number | null
          id: number
          limit_kw: number
          meter_id: string | null
          power_kw: number
        }
        Insert: {
          created_at?: string
          direction?: string
          duration_sec?: number | null
          id?: never
          limit_kw: number
          meter_id?: string | null
          power_kw: number
        }
        Update: {
          created_at?: string
          direction?: string
          duration_sec?: number | null
          id?: never
          limit_kw?: number
          meter_id?: string | null
          power_kw?: number
        }
        Relationships: [
          {
            foreignKeyName: "gtv_exceedances_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "energy_meters"
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
      load_balance_logs: {
        Row: {
          allocations: Json
          created_at: string
          grid_id: string
          grid_name: string
          gtv_limit_kw: number
          id: string
          strategy: string
          total_allocated_kw: number
          total_available_kw: number
        }
        Insert: {
          allocations?: Json
          created_at?: string
          grid_id: string
          grid_name: string
          gtv_limit_kw?: number
          id?: string
          strategy: string
          total_allocated_kw?: number
          total_available_kw?: number
        }
        Update: {
          allocations?: Json
          created_at?: string
          grid_id?: string
          grid_name?: string
          gtv_limit_kw?: number
          id?: string
          strategy?: string
          total_allocated_kw?: number
          total_available_kw?: number
        }
        Relationships: [
          {
            foreignKeyName: "load_balance_logs_grid_id_fkey"
            columns: ["grid_id"]
            isOneToOne: false
            referencedRelation: "virtual_grids"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_readings: {
        Row: {
          active_power: number | null
          apparent_power: number | null
          channel: number
          current: number | null
          frequency: number | null
          id: number
          meter_id: string
          power_factor: number | null
          timestamp: string
          total_energy: number | null
          voltage: number | null
        }
        Insert: {
          active_power?: number | null
          apparent_power?: number | null
          channel?: number
          current?: number | null
          frequency?: number | null
          id?: never
          meter_id: string
          power_factor?: number | null
          timestamp?: string
          total_energy?: number | null
          voltage?: number | null
        }
        Update: {
          active_power?: number | null
          apparent_power?: number | null
          channel?: number
          current?: number | null
          frequency?: number | null
          id?: never
          meter_id?: string
          power_factor?: number | null
          timestamp?: string
          total_energy?: number | null
          voltage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "energy_meters"
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
      mqtt_configurations: {
        Row: {
          asset_id: string
          asset_name: string | null
          asset_type: string
          broker_host: string
          broker_port: number
          client_id: string | null
          connection_status: string
          created_at: string
          enabled: boolean
          id: string
          keep_alive_sec: number
          last_connected_at: string | null
          password: string | null
          publish_topics: Json
          qos: number
          subscribe_topics: Json
          updated_at: string
          use_tls: boolean
          username: string | null
        }
        Insert: {
          asset_id: string
          asset_name?: string | null
          asset_type: string
          broker_host?: string
          broker_port?: number
          client_id?: string | null
          connection_status?: string
          created_at?: string
          enabled?: boolean
          id?: string
          keep_alive_sec?: number
          last_connected_at?: string | null
          password?: string | null
          publish_topics?: Json
          qos?: number
          subscribe_topics?: Json
          updated_at?: string
          use_tls?: boolean
          username?: string | null
        }
        Update: {
          asset_id?: string
          asset_name?: string | null
          asset_type?: string
          broker_host?: string
          broker_port?: number
          client_id?: string | null
          connection_status?: string
          created_at?: string
          enabled?: boolean
          id?: string
          keep_alive_sec?: number
          last_connected_at?: string | null
          password?: string | null
          publish_topics?: Json
          qos?: number
          subscribe_topics?: Json
          updated_at?: string
          use_tls?: boolean
          username?: string | null
        }
        Relationships: []
      }
      notification_channels: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ocpp_audit_log: {
        Row: {
          action: string
          charge_point_id: string
          created_at: string
          id: number
          payload: Json | null
          result: Json | null
          status: string
        }
        Insert: {
          action: string
          charge_point_id: string
          created_at?: string
          id?: never
          payload?: Json | null
          result?: Json | null
          status?: string
        }
        Update: {
          action?: string
          charge_point_id?: string
          created_at?: string
          id?: never
          payload?: Json | null
          result?: Json | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          customer_id: string | null
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          charge_point_id: string
          connector_id: number
          created_at: string
          expiry_date: string
          id: number
          id_tag: string
          parent_id_tag: string | null
          status: string
          updated_at: string
        }
        Insert: {
          charge_point_id: string
          connector_id?: number
          created_at?: string
          expiry_date: string
          id?: number
          id_tag: string
          parent_id_tag?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          charge_point_id?: string
          connector_id?: number
          created_at?: string
          expiry_date?: string
          id?: number
          id_tag?: string
          parent_id_tag?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
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
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
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
      user_module_permissions: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          module_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          module_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          module_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_whitelist: {
        Row: {
          auto_start: boolean
          brand: string | null
          charge_point_ids: string[] | null
          created_at: string
          enabled: boolean
          id: string
          label: string | null
          max_power_kw: number | null
          model: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          auto_start?: boolean
          brand?: string | null
          charge_point_ids?: string[] | null
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          max_power_kw?: number | null
          model?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          auto_start?: boolean
          brand?: string | null
          charge_point_ids?: string[] | null
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          max_power_kw?: number | null
          model?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      virtual_grid_members: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          grid_id: string
          id: string
          max_power_kw: number | null
          member_id: string
          member_name: string | null
          member_type: string
          priority: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          grid_id: string
          id?: string
          max_power_kw?: number | null
          member_id: string
          member_name?: string | null
          member_type: string
          priority?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          grid_id?: string
          id?: string
          max_power_kw?: number | null
          member_id?: string
          member_name?: string | null
          member_type?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "virtual_grid_members_grid_id_fkey"
            columns: ["grid_id"]
            isOneToOne: false
            referencedRelation: "virtual_grids"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_grids: {
        Row: {
          balancing_strategy: string
          config: Json
          created_at: string
          description: string | null
          enabled: boolean
          gtv_limit_kw: number
          id: string
          location: string | null
          name: string
          updated_at: string
        }
        Insert: {
          balancing_strategy?: string
          config?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          gtv_limit_kw?: number
          id?: string
          location?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          balancing_strategy?: string
          config?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          gtv_limit_kw?: number
          id?: string
          location?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "manager" | "operator" | "viewer"
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
    Enums: {
      app_role: ["admin", "user", "manager", "operator", "viewer"],
    },
  },
} as const

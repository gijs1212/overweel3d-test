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
      blog_posts: {
        Row: {
          author_name: string
          content: string
          created_at: string
          excerpt: string
          featured_image_url: string | null
          id: string
          meta_description: string
          published_at: string | null
          slug: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          author_name?: string
          content?: string
          created_at?: string
          excerpt?: string
          featured_image_url?: string | null
          id?: string
          meta_description?: string
          published_at?: string | null
          slug: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          excerpt?: string
          featured_image_url?: string | null
          id?: string
          meta_description?: string
          published_at?: string | null
          slug?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_appointments: {
        Row: {
          admin_notes: string | null
          created_at: string
          customer_notes: string | null
          id: string
          order_id: string
          proposed_by: string
          proposed_date: string
          proposed_time_slot: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          customer_notes?: string | null
          id?: string
          order_id: string
          proposed_by: string
          proposed_date: string
          proposed_time_slot?: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          customer_notes?: string | null
          id?: string
          order_id?: string
          proposed_by?: string
          proposed_date?: string
          proposed_time_slot?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_appointments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          max_uses: number | null
          times_used: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          times_used?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          times_used?: number
          updated_at?: string
        }
        Relationships: []
      }
      exported_orders: {
        Row: {
          completed_at: string | null
          created_at: string | null
          download_url: string
          id: string
          order_id: string
          order_number: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          download_url: string
          id?: string
          order_id: string
          order_number: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          download_url?: string
          id?: string
          order_id?: string
          order_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "exported_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          created_at: string | null
          event_description: string | null
          event_type: string
          id: string
          order_id: string
          performed_by: string | null
          visible_to_customer: boolean | null
        }
        Insert: {
          created_at?: string | null
          event_description?: string | null
          event_type: string
          id?: string
          order_id: string
          performed_by?: string | null
          visible_to_customer?: boolean | null
        }
        Update: {
          created_at?: string | null
          event_description?: string | null
          event_type?: string
          id?: string
          order_id?: string
          performed_by?: string | null
          visible_to_customer?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_files: {
        Row: {
          created_at: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          order_id: string
          original_filename: string
          storage_path: string
        }
        Insert: {
          created_at?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          order_id: string
          original_filename: string
          storage_path: string
        }
        Update: {
          created_at?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          order_id?: string
          original_filename?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_files_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          order_id: string
          read: boolean
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          order_id: string
          read?: boolean
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          order_id?: string
          read?: boolean
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approved_at: string | null
          billing_address: string | null
          city: string | null
          color: string | null
          company_name: string | null
          completed_at: string | null
          country: string | null
          created_at: string | null
          customer_email: string
          customer_name: string
          customer_order_token: string
          customer_upload_request_note: string | null
          customer_upload_requested: boolean
          customer_upload_requested_at: string | null
          customer_visible_notes: string | null
          delivery_email: string | null
          filament_price_per_kg: number | null
          filament_weight_g: number | null
          file_links: string | null
          final_price: number | null
          id: string
          instant_quote_price: number | null
          internal_notes: string | null
          material: string | null
          notes: string | null
          order_method: string
          order_number: string
          parts_per_plate: number | null
          parts_total: number | null
          phone: string | null
          plate_runs_completed: Json | null
          plate_runs_required: number | null
          plate_runs_required_per_plate: Json | null
          plates_completed: number | null
          postal_code: string | null
          print_preferences: string | null
          quantity: number | null
          rejected_at: string | null
          saved: boolean
          shipping_address: string | null
          shipping_carrier: string | null
          shipping_cost: number | null
          status: Database["public"]["Enums"]["order_status"]
          submitted_at: string | null
          tikkie_link: string | null
          tracking_code: string | null
          updated_at: string | null
          user_id: string | null
          vat_number: string | null
        }
        Insert: {
          approved_at?: string | null
          billing_address?: string | null
          city?: string | null
          color?: string | null
          company_name?: string | null
          completed_at?: string | null
          country?: string | null
          created_at?: string | null
          customer_email: string
          customer_name: string
          customer_order_token?: string
          customer_upload_request_note?: string | null
          customer_upload_requested?: boolean
          customer_upload_requested_at?: string | null
          customer_visible_notes?: string | null
          delivery_email?: string | null
          filament_price_per_kg?: number | null
          filament_weight_g?: number | null
          file_links?: string | null
          final_price?: number | null
          id?: string
          instant_quote_price?: number | null
          internal_notes?: string | null
          material?: string | null
          notes?: string | null
          order_method?: string
          order_number: string
          parts_per_plate?: number | null
          parts_total?: number | null
          phone?: string | null
          plate_runs_completed?: Json | null
          plate_runs_required?: number | null
          plate_runs_required_per_plate?: Json | null
          plates_completed?: number | null
          postal_code?: string | null
          print_preferences?: string | null
          quantity?: number | null
          rejected_at?: string | null
          saved?: boolean
          shipping_address?: string | null
          shipping_carrier?: string | null
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          submitted_at?: string | null
          tikkie_link?: string | null
          tracking_code?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_number?: string | null
        }
        Update: {
          approved_at?: string | null
          billing_address?: string | null
          city?: string | null
          color?: string | null
          company_name?: string | null
          completed_at?: string | null
          country?: string | null
          created_at?: string | null
          customer_email?: string
          customer_name?: string
          customer_order_token?: string
          customer_upload_request_note?: string | null
          customer_upload_requested?: boolean
          customer_upload_requested_at?: string | null
          customer_visible_notes?: string | null
          delivery_email?: string | null
          filament_price_per_kg?: number | null
          filament_weight_g?: number | null
          file_links?: string | null
          final_price?: number | null
          id?: string
          instant_quote_price?: number | null
          internal_notes?: string | null
          material?: string | null
          notes?: string | null
          order_method?: string
          order_number?: string
          parts_per_plate?: number | null
          parts_total?: number | null
          phone?: string | null
          plate_runs_completed?: Json | null
          plate_runs_required?: number | null
          plate_runs_required_per_plate?: Json | null
          plates_completed?: number | null
          postal_code?: string | null
          print_preferences?: string | null
          quantity?: number | null
          rejected_at?: string | null
          saved?: boolean
          shipping_address?: string | null
          shipping_carrier?: string | null
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          submitted_at?: string | null
          tikkie_link?: string | null
          tracking_code?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_number?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          colors: string[]
          created_at: string
          custom_text_enabled: boolean
          custom_text_label: string
          custom_text_max_length: number
          customer_photo_required: boolean
          description: string
          id: string
          materials: string[]
          name: string
          photos: string[]
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          colors?: string[]
          created_at?: string
          custom_text_enabled?: boolean
          custom_text_label?: string
          custom_text_max_length?: number
          customer_photo_required?: boolean
          description?: string
          id?: string
          materials?: string[]
          name: string
          photos?: string[]
          price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          colors?: string[]
          created_at?: string
          custom_text_enabled?: boolean
          custom_text_label?: string
          custom_text_max_length?: number
          customer_photo_required?: boolean
          description?: string
          id?: string
          materials?: string[]
          name?: string
          photos?: string[]
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          billing_address: string | null
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          postal_code: string | null
          shipping_address: string | null
          updated_at: string | null
          user_id: string
          vat_number: string | null
        }
        Insert: {
          billing_address?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          postal_code?: string | null
          shipping_address?: string | null
          updated_at?: string | null
          user_id: string
          vat_number?: string | null
        }
        Update: {
          billing_address?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          postal_code?: string | null
          shipping_address?: string | null
          updated_at?: string | null
          user_id?: string
          vat_number?: string | null
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
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_order_number: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_discount_usage: {
        Args: { code_text: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "customer"
      order_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "waiting_for_approval"
        | "approved_by_customer"
        | "rejected_by_customer"
        | "waiting_for_payment"
        | "in_production"
        | "completed"
        | "cancelled"
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
      app_role: ["admin", "customer"],
      order_status: [
        "draft",
        "submitted",
        "under_review",
        "waiting_for_approval",
        "approved_by_customer",
        "rejected_by_customer",
        "waiting_for_payment",
        "in_production",
        "completed",
        "cancelled",
      ],
    },
  },
} as const

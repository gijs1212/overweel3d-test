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
      app_settings: {
        Row: {
          created_at: string
          description: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          description?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
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
      categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
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
          assigned_to_email: string | null
          category_id: string | null
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_public: boolean
          is_referral: boolean
          max_uses: number | null
          minimum_order_amount: number
          owner_email: string | null
          owner_name: string | null
          parent_code_id: string | null
          per_customer_limit: number | null
          product_id: string | null
          reward_percentage: number | null
          source_order_id: string | null
          stackable: boolean
          starts_at: string | null
          times_used: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          assigned_to_email?: string | null
          category_id?: string | null
          code: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_public?: boolean
          is_referral?: boolean
          max_uses?: number | null
          minimum_order_amount?: number
          owner_email?: string | null
          owner_name?: string | null
          parent_code_id?: string | null
          per_customer_limit?: number | null
          product_id?: string | null
          reward_percentage?: number | null
          source_order_id?: string | null
          stackable?: boolean
          starts_at?: string | null
          times_used?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          assigned_to_email?: string | null
          category_id?: string | null
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_public?: boolean
          is_referral?: boolean
          max_uses?: number | null
          minimum_order_amount?: number
          owner_email?: string | null
          owner_name?: string | null
          parent_code_id?: string | null
          per_customer_limit?: number | null
          product_id?: string | null
          reward_percentage?: number | null
          source_order_id?: string | null
          stackable?: boolean
          starts_at?: string | null
          times_used?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_codes_parent_code_id_fkey"
            columns: ["parent_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_codes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_codes_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_redemptions: {
        Row: {
          created_at: string
          customer_email: string
          discount_amount: number
          discount_code_id: string
          id: string
          order_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_email: string
          discount_amount?: number
          discount_code_id: string
          id?: string
          order_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_email?: string
          discount_amount?: number
          discount_code_id?: string
          id?: string
          order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_redemptions_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          audience: string
          body: string
          change_type: string | null
          created_at: string
          created_by: string
          error_message: string | null
          failed_count: number
          id: string
          recipient_count: number
          sent_at: string | null
          sent_count: number
          status: string
          subject: string
          template_kind: string
        }
        Insert: {
          audience: string
          body: string
          change_type?: string | null
          created_at?: string
          created_by: string
          error_message?: string | null
          failed_count?: number
          id?: string
          recipient_count?: number
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject: string
          template_kind: string
        }
        Update: {
          audience?: string
          body?: string
          change_type?: string | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          failed_count?: number
          id?: string
          recipient_count?: number
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          template_kind?: string
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
      filament_colors: {
        Row: {
          active: boolean
          created_at: string
          description: string
          hex: string
          id: string
          material: string
          name: string
          photos: string[]
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          hex?: string
          id?: string
          material: string
          name: string
          photos?: string[]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          hex?: string
          id?: string
          material?: string
          name?: string
          photos?: string[]
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      filament_inventory: {
        Row: {
          color_hex: string | null
          color_name: string | null
          created_at: string
          filament_color_id: string | null
          id: string
          inventory_key: string
          last_seen_at: string
          metadata_completed_request_id: number
          metadata_last_error: string | null
          metadata_request_id: number
          manual_weight_grams: number | null
          material: string | null
          remaining_percent: number | null
          source_ams_unit: number | null
          source_printer_id: string | null
          source_slot_number: number | null
          spool_capacity_grams: number
          total_weight_grams: number | null
          tray_uuid: string | null
          updated_at: string
        }
        Insert: {
          color_hex?: string | null
          color_name?: string | null
          created_at?: string
          filament_color_id?: string | null
          id?: string
          inventory_key: string
          last_seen_at?: string
          metadata_completed_request_id?: number
          metadata_last_error?: string | null
          metadata_request_id?: number
          manual_weight_grams?: number | null
          material?: string | null
          remaining_percent?: number | null
          source_ams_unit?: number | null
          source_printer_id?: string | null
          source_slot_number?: number | null
          spool_capacity_grams?: number
          total_weight_grams?: number | null
          tray_uuid?: string | null
          updated_at?: string
        }
        Update: {
          color_hex?: string | null
          color_name?: string | null
          created_at?: string
          filament_color_id?: string | null
          id?: string
          inventory_key?: string
          last_seen_at?: string
          metadata_completed_request_id?: number
          metadata_last_error?: string | null
          metadata_request_id?: number
          manual_weight_grams?: number | null
          material?: string | null
          remaining_percent?: number | null
          source_ams_unit?: number | null
          source_printer_id?: string | null
          source_slot_number?: number | null
          spool_capacity_grams?: number
          total_weight_grams?: number | null
          tray_uuid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "filament_inventory_filament_color_id_fkey"
            columns: ["filament_color_id"]
            isOneToOne: false
            referencedRelation: "filament_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filament_inventory_source_printer_id_fkey"
            columns: ["source_printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_redemptions: {
        Row: {
          amount: number
          created_at: string
          gift_card_id: string
          id: string
          order_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          gift_card_id: string
          id?: string
          order_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          gift_card_id?: string
          id?: string
          order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_redemptions_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          active: boolean
          assigned_to_email: string | null
          code: string
          created_at: string
          created_by: string | null
          current_balance: number
          expires_at: string | null
          id: string
          initial_balance: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          assigned_to_email?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          current_balance: number
          expires_at?: string | null
          id?: string
          initial_balance: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          assigned_to_email?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          current_balance?: number
          expires_at?: string | null
          id?: string
          initial_balance?: number
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          description: string
          id: string
          kind: string
          order_id: string | null
          points: number
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          kind: string
          order_id?: string | null
          points: number
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          kind?: string
          order_id?: string | null
          points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: { active: boolean; created_at: string; id: string; name: string; price_per_gram: number; sort_order: number; updated_at: string }
        Insert: { active?: boolean; created_at?: string; id: string; name: string; price_per_gram?: number; sort_order?: number; updated_at?: string }
        Update: { active?: boolean; created_at?: string; id?: string; name?: string; price_per_gram?: number; sort_order?: number; updated_at?: string }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string | null
          source: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          name?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_subscriptions: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          source: string
          subscribed_at: string
          unsubscribed_at: string | null
          updated_at: string
          user_id: string | null
          welcome_email_claimed_at: string | null
          welcome_email_sent_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          source?: string
          subscribed_at?: string
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string | null
          welcome_email_claimed_at?: string | null
          welcome_email_sent_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          source?: string
          subscribed_at?: string
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string | null
          welcome_email_claimed_at?: string | null
          welcome_email_sent_at?: string | null
        }
        Relationships: []
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
          customer_visible: boolean
          created_at: string | null
          file_purpose: string
          file_size: number | null
          id: string
          mime_type: string | null
          order_id: string
          original_filename: string
          storage_path: string
        }
        Insert: {
          customer_visible?: boolean
          created_at?: string | null
          file_purpose?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          order_id: string
          original_filename: string
          storage_path: string
        }
        Update: {
          customer_visible?: boolean
          created_at?: string | null
          file_purpose?: string
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
      order_3mf_plate_mappings: {
        Row: {
          active: boolean
          colors: Json
          created_at: string
          id: string
          logical_plate_number: number | null
          order_file_id: string
          order_id: string
          preview_storage_path: string | null
          runs_completed: number
          runs_required: number
          source_file_name: string
          source_plate_number: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          colors?: Json
          created_at?: string
          id?: string
          logical_plate_number?: number | null
          order_file_id: string
          order_id: string
          preview_storage_path?: string | null
          runs_completed?: number
          runs_required?: number
          source_file_name?: string
          source_plate_number: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          colors?: Json
          created_at?: string
          id?: string
          logical_plate_number?: number | null
          order_file_id?: string
          order_id?: string
          preview_storage_path?: string | null
          runs_completed?: number
          runs_required?: number
          source_file_name?: string
          source_plate_number?: number
          updated_at?: string
        }
        Relationships: []
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
          applied_discount_code: string | null
          approved_at: string | null
          billing_address: string | null
          catalog_items: Json
          city: string | null
          color: string | null
          company_name: string | null
          completed_at: string | null
          confirmation_email_claimed_at: string | null
          confirmation_email_sent_at: string | null
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
          filament_used_g: number | null
          filament_weight_g: number | null
          file_links: string | null
          final_price: number | null
          gift_card_amount: number
          gift_card_code: string | null
          id: string
          instant_quote_price: number | null
          internal_notes: string | null
          link_first_viewed_at: string | null
          link_last_viewed_at: string | null
          link_view_count: number
          loyalty_points_awarded: number
          material: string | null
          material_cost: number | null
          notes: string | null
          order_method: string
          order_number: string
          parts_per_plate: number | null
          parts_total: number | null
          phone: string | null
          plate_print_statuses: Json
          plate_runs_completed: Json | null
          plate_runs_required: number | null
          plate_runs_required_per_plate: Json | null
          plates_completed: number | null
          postal_code: string | null
          print_duration_minutes: number | null
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
          total_plates: number
          total_products: number
          tracking_code: string | null
          updated_at: string | null
          user_id: string | null
          vat_number: string | null
        }
        Insert: {
          applied_discount_code?: string | null
          approved_at?: string | null
          billing_address?: string | null
          catalog_items?: Json
          city?: string | null
          color?: string | null
          company_name?: string | null
          completed_at?: string | null
          confirmation_email_claimed_at?: string | null
          confirmation_email_sent_at?: string | null
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
          filament_used_g?: number | null
          filament_weight_g?: number | null
          file_links?: string | null
          final_price?: number | null
          gift_card_amount?: number
          gift_card_code?: string | null
          id?: string
          instant_quote_price?: number | null
          internal_notes?: string | null
          link_first_viewed_at?: string | null
          link_last_viewed_at?: string | null
          link_view_count?: number
          loyalty_points_awarded?: number
          material?: string | null
          material_cost?: number | null
          notes?: string | null
          order_method?: string
          order_number: string
          parts_per_plate?: number | null
          parts_total?: number | null
          phone?: string | null
          plate_print_statuses?: Json
          plate_runs_completed?: Json | null
          plate_runs_required?: number | null
          plate_runs_required_per_plate?: Json | null
          plates_completed?: number | null
          postal_code?: string | null
          print_duration_minutes?: number | null
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
          total_plates?: number
          total_products?: number
          tracking_code?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_number?: string | null
        }
        Update: {
          applied_discount_code?: string | null
          approved_at?: string | null
          billing_address?: string | null
          catalog_items?: Json
          city?: string | null
          color?: string | null
          company_name?: string | null
          completed_at?: string | null
          confirmation_email_claimed_at?: string | null
          confirmation_email_sent_at?: string | null
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
          filament_used_g?: number | null
          filament_weight_g?: number | null
          file_links?: string | null
          final_price?: number | null
          gift_card_amount?: number
          gift_card_code?: string | null
          id?: string
          instant_quote_price?: number | null
          internal_notes?: string | null
          link_first_viewed_at?: string | null
          link_last_viewed_at?: string | null
          link_view_count?: number
          loyalty_points_awarded?: number
          material?: string | null
          material_cost?: number | null
          notes?: string | null
          order_method?: string
          order_number?: string
          parts_per_plate?: number | null
          parts_total?: number | null
          phone?: string | null
          plate_print_statuses?: Json
          plate_runs_completed?: Json | null
          plate_runs_required?: number | null
          plate_runs_required_per_plate?: Json | null
          plates_completed?: number | null
          postal_code?: string | null
          print_duration_minutes?: number | null
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
          total_plates?: number
          total_products?: number
          tracking_code?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_applied_discount_code_fkey"
            columns: ["applied_discount_code"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      print_jobs: {
        Row: {
          active: boolean
          approved_at: string | null
          approved_by: string | null
          colors: Json
          comparison: Json
          completed_at: string | null
          created_at: string
          estimated_duration_minutes: number | null
          estimated_filament_grams: number | null
          expected_file_name: string
          id: string
          material: string | null
          observed_file_name: string | null
          order_id: string
          plate_name: string
          plate_mapping_id: string | null
          plate_number: number
          printer_id: string | null
          runs_completed: number
          runs_required: number
          scheduled_at: string | null
          source_order_file_id: string | null
          source_plate_number: number | null
          started_at: string | null
          status: string
          suggested_at: string | null
          three_mf_signature: string | null
          three_mf_storage_path: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          colors?: Json
          comparison?: Json
          completed_at?: string | null
          created_at?: string
          estimated_duration_minutes?: number | null
          estimated_filament_grams?: number | null
          expected_file_name?: string
          id?: string
          material?: string | null
          observed_file_name?: string | null
          order_id: string
          plate_name?: string
          plate_mapping_id?: string | null
          plate_number: number
          printer_id?: string | null
          runs_completed?: number
          runs_required?: number
          scheduled_at?: string | null
          source_order_file_id?: string | null
          source_plate_number?: number | null
          started_at?: string | null
          status?: string
          suggested_at?: string | null
          three_mf_signature?: string | null
          three_mf_storage_path?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          colors?: Json
          comparison?: Json
          completed_at?: string | null
          created_at?: string
          estimated_duration_minutes?: number | null
          estimated_filament_grams?: number | null
          expected_file_name?: string
          id?: string
          material?: string | null
          observed_file_name?: string | null
          order_id?: string
          plate_name?: string
          plate_mapping_id?: string | null
          plate_number?: number
          printer_id?: string | null
          runs_completed?: number
          runs_required?: number
          scheduled_at?: string | null
          source_order_file_id?: string | null
          source_plate_number?: number | null
          started_at?: string | null
          status?: string
          suggested_at?: string | null
          three_mf_signature?: string | null
          three_mf_storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_source_order_file_id_fkey"
            columns: ["source_order_file_id"]
            isOneToOne: false
            referencedRelation: "order_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      print_runs: {
        Row: {
          completed_at: string | null
          filament_used_grams: number | null
          id: string
          observed_file_name: string | null
          print_job_id: string
          printer_id: string
          raw_status: Json
          run_number: number
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          filament_used_grams?: number | null
          id?: string
          observed_file_name?: string | null
          print_job_id: string
          printer_id: string
          raw_status?: Json
          run_number: number
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          filament_used_grams?: number | null
          id?: string
          observed_file_name?: string | null
          print_job_id?: string
          printer_id?: string
          raw_status?: Json
          run_number?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_runs_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "print_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_runs_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      printer_queue_items: {
        Row: {
          ams_mapping: number[]
          blocked_reason: string | null
          bridge_error: string | null
          calibration_enabled: boolean
          command_claimed_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          file_name: string
          id: string
          plate_number: number
          position: number
          printer_id: string
          required_colors: Json
          sd_file_id: string | null
          sd_file_path: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ams_mapping?: number[]
          blocked_reason?: string | null
          bridge_error?: string | null
          calibration_enabled?: boolean
          command_claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          file_name: string
          id?: string
          plate_number: number
          position: number
          printer_id: string
          required_colors?: Json
          sd_file_id?: string | null
          sd_file_path: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ams_mapping?: number[]
          blocked_reason?: string | null
          bridge_error?: string | null
          calibration_enabled?: boolean
          command_claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string
          id?: string
          plate_number?: number
          position?: number
          printer_id?: string
          required_colors?: Json
          sd_file_id?: string | null
          sd_file_path?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      printer_sd_files: {
        Row: {
          available: boolean
          created_at: string
          display_name: string
          detected_color_name: string | null
          detected_filaments: Json
          detected_material: string | null
          id: string
          last_seen_at: string
          metadata_completed_request_id: number
          metadata_last_error: string | null
          metadata_request_id: number
          metadata_requested_plate_number: number | null
          modified_at: string | null
          path: string
          plates: Json
          printer_id: string
          size_bytes: number | null
          updated_at: string
        }
        Insert: {
          available?: boolean
          created_at?: string
          display_name: string
          detected_color_name?: string | null
          detected_filaments?: Json
          detected_material?: string | null
          id?: string
          last_seen_at?: string
          metadata_completed_request_id?: number
          metadata_last_error?: string | null
          metadata_request_id?: number
          metadata_requested_plate_number?: number | null
          modified_at?: string | null
          path: string
          plates?: Json
          printer_id: string
          size_bytes?: number | null
          updated_at?: string
        }
        Update: {
          available?: boolean
          created_at?: string
          display_name?: string
          detected_color_name?: string | null
          detected_filaments?: Json
          detected_material?: string | null
          id?: string
          last_seen_at?: string
          metadata_completed_request_id?: number
          metadata_last_error?: string | null
          metadata_request_id?: number
          metadata_requested_plate_number?: number | null
          modified_at?: string | null
          path?: string
          plates?: Json
          printer_id?: string
          size_bytes?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      printer_ams_slots: {
        Row: {
          ams_unit: number
          color_hex: string | null
          color_name: string | null
          id: string
          material: string | null
          printer_id: string
          raw_status: Json
          remaining_grams: number | null
          remaining_percent: number | null
          slot_number: number
          spool_capacity_grams: number
          tray_uuid: string | null
          updated_at: string
        }
        Insert: {
          ams_unit?: number
          color_hex?: string | null
          color_name?: string | null
          id?: string
          material?: string | null
          printer_id: string
          raw_status?: Json
          remaining_grams?: number | null
          remaining_percent?: number | null
          slot_number: number
          spool_capacity_grams?: number
          tray_uuid?: string | null
          updated_at?: string
        }
        Update: {
          ams_unit?: number
          color_hex?: string | null
          color_name?: string | null
          id?: string
          material?: string | null
          printer_id?: string
          raw_status?: Json
          remaining_grams?: number | null
          remaining_percent?: number | null
          slot_number?: number
          spool_capacity_grams?: number
          tray_uuid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "printer_ams_slots_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      printers: {
        Row: {
          bed_temperature: number | null
          bridge_refresh_token_hash: string | null
          bridge_token_hash: string | null
          bridge_token_refreshed_at: string | null
          camera_last_seen_at: string | null
          camera_status: string
          connection_mode: string
          chamber_temperature: number | null
          created_at: string
          current_file: string | null
          current_layer: number | null
          current_plate: number | null
          device_serial: string
          ftps_directory_listing: Json
          ftps_folder_scan_requested_at: string | null
          ftps_folder_scan_request_id: number
          ftps_folder_scan_completed_request_id: number
          ftps_last_error: string | null
          ftps_scan_paths: Json
          ftps_scan_requested_at: string | null
          ftps_scan_request_id: number
          ftps_scan_completed_request_id: number
          host_pc_checked_at: string | null
          host_pc_status: string
          host_pc_uptime_seconds: number | null
          id: string
          last_seen_at: string | null
          maintenance_note: string
          model: string
          name: string
          nozzle_temperature: number | null
          offline_alert_sent_at: string | null
          offline_since: string | null
          plate_check_status: string
          plate_state_changed_at: string | null
          print_start_completed_request_id: number
          print_start_request_id: number
          progress: number
          raw_status: Json
          remaining_minutes: number | null
          sd_card_last_seen_at: string | null
          status: string
          total_layers: number | null
          updated_at: string
        }
        Insert: {
          bed_temperature?: number | null
          bridge_refresh_token_hash?: string | null
          bridge_token_hash?: string | null
          bridge_token_refreshed_at?: string | null
          camera_last_seen_at?: string | null
          camera_status?: string
          connection_mode?: string
          chamber_temperature?: number | null
          created_at?: string
          current_file?: string | null
          current_layer?: number | null
          current_plate?: number | null
          device_serial: string
          ftps_directory_listing?: Json
          ftps_folder_scan_requested_at?: string | null
          ftps_folder_scan_request_id?: number
          ftps_folder_scan_completed_request_id?: number
          ftps_last_error?: string | null
          ftps_scan_paths?: Json
          ftps_scan_requested_at?: string | null
          ftps_scan_request_id?: number
          ftps_scan_completed_request_id?: number
          host_pc_checked_at?: string | null
          host_pc_status?: string
          host_pc_uptime_seconds?: number | null
          id?: string
          last_seen_at?: string | null
          maintenance_note?: string
          model?: string
          name: string
          nozzle_temperature?: number | null
          offline_alert_sent_at?: string | null
          offline_since?: string | null
          plate_check_status?: string
          plate_state_changed_at?: string | null
          print_start_completed_request_id?: number
          print_start_request_id?: number
          progress?: number
          raw_status?: Json
          remaining_minutes?: number | null
          sd_card_last_seen_at?: string | null
          status?: string
          total_layers?: number | null
          updated_at?: string
        }
        Update: {
          bed_temperature?: number | null
          bridge_refresh_token_hash?: string | null
          bridge_token_hash?: string | null
          bridge_token_refreshed_at?: string | null
          camera_last_seen_at?: string | null
          camera_status?: string
          connection_mode?: string
          chamber_temperature?: number | null
          created_at?: string
          current_file?: string | null
          current_layer?: number | null
          current_plate?: number | null
          device_serial?: string
          ftps_directory_listing?: Json
          ftps_folder_scan_requested_at?: string | null
          ftps_folder_scan_request_id?: number
          ftps_folder_scan_completed_request_id?: number
          ftps_last_error?: string | null
          ftps_scan_paths?: Json
          ftps_scan_requested_at?: string | null
          ftps_scan_request_id?: number
          ftps_scan_completed_request_id?: number
          host_pc_checked_at?: string | null
          host_pc_status?: string
          host_pc_uptime_seconds?: number | null
          id?: string
          last_seen_at?: string | null
          maintenance_note?: string
          model?: string
          name?: string
          nozzle_temperature?: number | null
          offline_alert_sent_at?: string | null
          offline_since?: string | null
          plate_check_status?: string
          plate_state_changed_at?: string | null
          print_start_completed_request_id?: number
          print_start_request_id?: number
          progress?: number
          raw_status?: Json
          remaining_minutes?: number | null
          sd_card_last_seen_at?: string | null
          status?: string
          total_layers?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_color_availability: {
        Row: {
          available: boolean
          color_id: string
          created_at: string
          id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          available?: boolean
          color_id: string
          created_at?: string
          id?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          available?: boolean
          color_id?: string
          created_at?: string
          id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_color_availability_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "filament_colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_color_availability_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string
          created_at: string
          id: string
          is_main: boolean | null
          is_primary: boolean
          media_type: string
          order: number | null
          product_id: string
          sort_order: number
          storage_path: string
          updated_at: string
          url: string | null
        }
        Insert: {
          alt_text?: string
          created_at?: string
          id?: string
          is_main?: boolean | null
          is_primary?: boolean
          media_type?: string
          order?: number | null
          product_id: string
          sort_order?: number
          storage_path: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          alt_text?: string
          created_at?: string
          id?: string
          is_main?: boolean | null
          is_primary?: boolean
          media_type?: string
          order?: number | null
          product_id?: string
          sort_order?: number
          storage_path?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          active: boolean
          choices: Json
          color_slot_labels: Json
          color_slots: number
          created_at: string
          description: string
          id: string
          is_addon: boolean
          label: string
          max_length: number | null
          price_adjustment: number
          product_id: string
          required: boolean
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          choices?: Json
          color_slot_labels?: Json
          color_slots?: number
          created_at?: string
          description?: string
          id?: string
          is_addon?: boolean
          label: string
          max_length?: number | null
          price_adjustment?: number
          product_id: string
          required?: boolean
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          choices?: Json
          color_slot_labels?: Json
          color_slots?: number
          created_at?: string
          description?: string
          id?: string
          is_addon?: boolean
          label?: string
          max_length?: number | null
          price_adjustment?: number
          product_id?: string
          required?: boolean
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          body: string
          created_at: string
          id: string
          order_id: string
          photos: Json
          product_id: string
          rating: number
          status: string
          title: string
          updated_at: string
          user_id: string
          verified: boolean
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          order_id: string
          photos?: Json
          product_id: string
          rating: number
          status?: string
          title?: string
          updated_at?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          order_id?: string
          photos?: Json
          product_id?: string
          rating?: number
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          created_at: string
          id: string
          material_id: string | null
          name: string
          price_adjustment: number
          product_id: string
          size_label: string | null
          sku: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          material_id?: string | null
          name: string
          price_adjustment?: number
          product_id: string
          size_label?: string | null
          sku?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          material_id?: string | null
          name?: string
          price_adjustment?: number
          product_id?: string
          size_label?: string | null
          sku?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string | null
          color_required: boolean
          color_selection_mode: string
          color_slot_labels: string[]
          colors: string[]
          colors_configured: boolean
          created_at: string
          custom_fields: Json
          custom_text_enabled: boolean
          custom_text_label: string
          custom_text_max_length: number
          customer_photo_required: boolean
          description: string
          id: string
          material_fixed: boolean
          material_mode: string
          materials: string[]
          max_colors: number
          multicolor_allowed: boolean
          name: string
          photos: string[]
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          color_required?: boolean
          color_selection_mode?: string
          color_slot_labels?: string[]
          colors?: string[]
          colors_configured?: boolean
          created_at?: string
          custom_fields?: Json
          custom_text_enabled?: boolean
          custom_text_label?: string
          custom_text_max_length?: number
          customer_photo_required?: boolean
          description?: string
          id?: string
          material_fixed?: boolean
          material_mode?: string
          materials?: string[]
          max_colors?: number
          multicolor_allowed?: boolean
          name: string
          photos?: string[]
          price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          color_required?: boolean
          color_selection_mode?: string
          color_slot_labels?: string[]
          colors?: string[]
          colors_configured?: boolean
          created_at?: string
          custom_fields?: Json
          custom_text_enabled?: boolean
          custom_text_label?: string
          custom_text_max_length?: number
          customer_photo_required?: boolean
          description?: string
          id?: string
          material_fixed?: boolean
          material_mode?: string
          materials?: string[]
          max_colors?: number
          multicolor_allowed?: boolean
          name?: string
          photos?: string[]
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_welcome_email_claimed_at: string | null
          account_welcome_email_sent_at: string | null
          billing_address: string | null
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          loyalty_points: number
          newsletter_subscribed: boolean
          phone: string | null
          postal_code: string | null
          shipping_address: string | null
          updated_at: string | null
          user_id: string
          vat_number: string | null
        }
        Insert: {
          account_welcome_email_claimed_at?: string | null
          account_welcome_email_sent_at?: string | null
          billing_address?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          loyalty_points?: number
          newsletter_subscribed?: boolean
          phone?: string | null
          postal_code?: string | null
          shipping_address?: string | null
          updated_at?: string | null
          user_id: string
          vat_number?: string | null
        }
        Update: {
          account_welcome_email_claimed_at?: string | null
          account_welcome_email_sent_at?: string | null
          billing_address?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          loyalty_points?: number
          newsletter_subscribed?: boolean
          phone?: string | null
          postal_code?: string | null
          shipping_address?: string | null
          updated_at?: string | null
          user_id?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      saved_carts: {
        Row: {
          checkout_at: string | null
          created_at: string
          email: string
          id: string
          items: Json
          reminder_count: number
          reminder_sent_at: string | null
          status: string
          subtotal: number
          updated_at: string
          user_id: string
        }
        Insert: {
          checkout_at?: string | null
          created_at?: string
          email?: string
          id?: string
          items?: Json
          reminder_count?: number
          reminder_sent_at?: string | null
          status?: string
          subtotal?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          checkout_at?: string | null
          created_at?: string
          email?: string
          id?: string
          items?: Json
          reminder_count?: number
          reminder_sent_at?: string | null
          status?: string
          subtotal?: number
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
      request_printer_file_metadata: {
        Args: { p_file_id: string; p_plate_number?: number | null }
        Returns: number
      }
      request_printer_queue_start: {
        Args: { p_printer_id: string }
        Returns: number
      }
      request_printer_ftps_scan: {
        Args: { p_printer_id: string; p_kind: string; p_scan_paths?: Json | null }
        Returns: number
      }
      request_printer_full_refresh: {
        Args: { p_printer_id: string; p_scan_paths?: Json | null }
        Returns: Json
      }
      request_printer_ams_refresh: {
        Args: { p_printer_id: string }
        Returns: number
      }
      approve_and_count_print_job_run: {
        Args: { p_plate_number: number; p_suggestion_job_id: string }
        Returns: Json
      }
      reorder_printer_queue: {
        Args: { p_item_ids: string[]; p_printer_id: string }
        Returns: undefined
      }
      decrement_manual_order_plate_run: {
        Args: { p_order_id: string; p_plate_number: number }
        Returns: Json
      }
      save_order_3mf_plate_selection: {
        Args: { p_order_id: string; p_mappings: Json }
        Returns: Json
      }
      complete_print_job_run: {
        Args: {
          p_job_id: string
          p_observed_file_name: string
          p_printer_id: string
          p_raw_status?: Json
        }
        Returns: Json
      }
      check_discount_code: {
        Args: { code_text: string; email_text: string; order_amount: number }
        Returns: {
          assigned_to_email: string
          category_id: string
          code: string
          discount_type: string
          discount_value: number
          expires_at: string
          id: string
          is_referral: boolean
          max_uses: number
          minimum_order_amount: number
          per_customer_limit: number
          product_id: string
          stackable: boolean
          starts_at: string
          times_used: number
        }[]
      }
      check_gift_card: {
        Args: { code_text: string; email_text: string }
        Returns: {
          code: string
          current_balance: number
          expires_at: string
        }[]
      }
      claim_account_welcome: { Args: { p_user_id: string }; Returns: boolean }
      claim_newsletter_welcome: {
        Args: { p_subscription_id: string }
        Returns: boolean
      }
      claim_order_confirmation: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      claim_order_to_account: { Args: { p_token: string }; Returns: boolean }
      convert_loyalty_points: {
        Args: { points_to_redeem: number }
        Returns: string
      }
      create_guest_order: {
        Args: { p_order: Json }
        Returns: {
          customer_order_token: string
          id: string
        }[]
      }
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
      promote_inventory_to_filament_color: {
        Args: {
          p_active?: boolean
          p_description?: string
          p_hex: string
          p_inventory_id: string
          p_material: string
          p_name: string
        }
        Returns: string
      }
      record_discount_redemption: {
        Args: {
          code_text: string
          discount_amount_value: number
          order_id_value: string
        }
        Returns: boolean
      }
      refresh_order_plate_data: {
        Args: { p_order_id: string }
        Returns: Json
      }
      record_order_link_visit: { Args: { p_token: string }; Returns: boolean }
      redeem_gift_card: {
        Args: {
          code_text: string
          order_id_value: string
          requested_amount: number
        }
        Returns: number
      }
      set_newsletter_subscription: {
        Args: {
          p_active: boolean
          p_email: string
          p_source: string
          p_user_id?: string
        }
        Returns: {
          subscription_id: string
          welcome_needed: boolean
        }[]
      }
      subscribe_to_newsletter: {
        Args: { _email: string; _source?: string }
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

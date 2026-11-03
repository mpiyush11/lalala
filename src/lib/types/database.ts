export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      attendance: {
        Row: {
          checked_in_at: string;
          checked_out_at: string | null;
          created_at: string;
          id: string;
          member_id: string;
          notes: string | null;
          recorded_by: string;
          source: Database['public']['Enums']['attendance_source'];
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          checked_in_at?: string;
          checked_out_at?: string | null;
          created_at?: string;
          id?: string;
          member_id: string;
          notes?: string | null;
          recorded_by: string;
          source?: Database['public']['Enums']['attendance_source'];
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          checked_in_at?: string;
          checked_out_at?: string | null;
          created_at?: string;
          id?: string;
          member_id?: string;
          notes?: string | null;
          recorded_by?: string;
          source?: Database['public']['Enums']['attendance_source'];
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_member_tenant_fkey';
            columns: ['member_id', 'tenant_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'tenant_id'];
          },
          {
            foreignKeyName: 'attendance_recorded_by_tenant_fkey';
            columns: ['recorded_by', 'tenant_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id', 'tenant_id'];
          },
          {
            foreignKeyName: 'attendance_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      shifts: {
        Row: {
          actual_cash_minor: number | null;
          closed_at: string | null;
          created_at: string;
          id: string;
          notes: string | null;
          opened_at: string;
          opening_cash_minor: number;
          petty_expenses_minor: number;
          staff_id: string;
          status: ShiftStatus;
          system_cash_in_minor: number;
          tenant_id: string;
          variance_minor: number | null;
        };
        Insert: {
          id?: string;
          notes?: string | null;
          opened_at?: string;
          opening_cash_minor?: number;
          staff_id: string;
          status?: ShiftStatus;
          tenant_id: string;
        };
        Update: {
          closed_at?: string | null;
          notes?: string | null;
          opening_cash_minor?: number;
          status?: ShiftStatus;
        };
        Relationships: [];
      };
      trainer_payouts: {
        Row: {
          amount_minor: number;
          created_at: string;
          id: string;
          notes: string | null;
          paid_at: string;
          payment_mode: TrainerPayoutMode;
          period_end: string;
          period_start: string;
          tenant_id: string;
          trainer_id: string;
        };
        Insert: {
          amount_minor: number;
          id?: string;
          notes?: string | null;
          paid_at?: string;
          payment_mode: TrainerPayoutMode;
          period_end: string;
          period_start: string;
          tenant_id: string;
          trainer_id: string;
        };
        Update: {
          amount_minor?: number;
          notes?: string | null;
          payment_mode?: TrainerPayoutMode;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          converted_member_id: string | null;
          created_at: string;
          full_name: string;
          goal: string | null;
          id: string;
          phone_number: string;
          request: string | null;
          source: string;
          status: Database['public']['Enums']['lead_status'];
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          converted_member_id?: string | null;
          full_name: string;
          goal?: string | null;
          id?: string;
          phone_number: string;
          request?: string | null;
          source: string;
          status?: Database['public']['Enums']['lead_status'];
          tenant_id: string;
        };
        Update: {
          converted_member_id?: string | null;
          status?: Database['public']['Enums']['lead_status'];
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          is_read: boolean;
          kind: string;
          member_id: string | null;
          severity: Database['public']['Enums']['notification_severity'];
          tenant_id: string;
          title: string;
        };
        Insert: {
          body: string;
          id?: string;
          is_read?: boolean;
          kind: string;
          member_id?: string | null;
          severity?: Database['public']['Enums']['notification_severity'];
          tenant_id: string;
          title: string;
        };
        Update: { is_read?: boolean };
        Relationships: [];
      };
      expenses: {
        Row: {
          amount_minor: number;
          approved_at: string | null;
          approved_by_user_id: string | null;
          category: Database['public']['Enums']['expense_category'];
          created_at: string;
          id: string;
          note: string | null;
          recorded_by: string;
          rejection_reason: string | null;
          shift_id: string | null;
          spent_at: string;
          status: ExpenseApprovalStatus;
          tenant_id: string;
        };
        Insert: {
          amount_minor: number;
          category: Database['public']['Enums']['expense_category'];
          created_at?: string;
          id?: string;
          note?: string | null;
          recorded_by: string;
          spent_at?: string;
          tenant_id: string;
        };
        Update: {
          amount_minor?: number;
          category?: Database['public']['Enums']['expense_category'];
          note?: string | null;
          spent_at?: string;
        };
        Relationships: [];
      };
      members: {
        Row: {
          address: string | null;
          created_at: string;
          created_by: string;
          date_of_birth: string | null;
          email: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          full_name: string;
          gender: string | null;
          id: string;
          member_code: string;
          membership_expires_on: string;
          membership_started_on: string;
          notes: string | null;
          phone_number: string;
          status: Database['public']['Enums']['member_status'];
          tenant_id: string;
          updated_at: string;
          assigned_trainer_id: string | null;
          balance_due_minor: number;
          freeze_started_on: string | null;
          freeze_resumes_on: string | null;
          freeze_reason: string | null;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          created_by: string;
          date_of_birth?: string | null;
          email?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          full_name: string;
          gender?: string | null;
          id?: string;
          member_code: string;
          membership_expires_on: string;
          membership_started_on: string;
          notes?: string | null;
          phone_number: string;
          status?: Database['public']['Enums']['member_status'];
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          created_by?: string;
          date_of_birth?: string | null;
          email?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          full_name?: string;
          gender?: string | null;
          id?: string;
          member_code?: string;
          membership_expires_on?: string;
          membership_started_on?: string;
          notes?: string | null;
          phone_number?: string;
          status?: Database['public']['Enums']['member_status'];
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'members_created_by_tenant_fkey';
            columns: ['created_by', 'tenant_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id', 'tenant_id'];
          },
          {
            foreignKeyName: 'members_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount_minor: number;
          created_at: string;
          currency: string;
          discount_minor: number;
          id: string;
          member_id: string;
          method: Database['public']['Enums']['payment_method'];
          notes: string | null;
          receipt_hash: string;
          receipt_security_code: string;
          renewal_kind: string | null;
          gap_reason: string | null;
          gap_days: number | null;
          cash_minor: number;
          is_pt_plan: boolean;
          shift_id: string | null;
          upi_minor: number;
          total_due_minor: number | null;
          balance_due_minor: number;
          due_settlement_date: string | null;
          paid_at: string | null;
          period_ends_on: string | null;
          period_starts_on: string | null;
          recorded_by: string;
          reference_number: string | null;
          status: Database['public']['Enums']['payment_status'];
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount_minor: number;
          created_at?: string;
          currency?: string;
          discount_minor?: number;
          id?: string;
          member_id: string;
          method: Database['public']['Enums']['payment_method'];
          notes?: string | null;
          receipt_hash?: never;
          receipt_security_code?: never;
          paid_at?: string | null;
          period_ends_on?: string | null;
          period_starts_on?: string | null;
          recorded_by: string;
          reference_number?: string | null;
          status?: Database['public']['Enums']['payment_status'];
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          currency?: string;
          discount_minor?: number;
          id?: string;
          member_id?: string;
          method?: Database['public']['Enums']['payment_method'];
          notes?: string | null;
          receipt_hash?: never;
          receipt_security_code?: never;
          paid_at?: string | null;
          period_ends_on?: string | null;
          period_starts_on?: string | null;
          recorded_by?: string;
          reference_number?: string | null;
          status?: Database['public']['Enums']['payment_status'];
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_member_tenant_fkey';
            columns: ['member_id', 'tenant_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id', 'tenant_id'];
          },
          {
            foreignKeyName: 'payments_recorded_by_tenant_fkey';
            columns: ['recorded_by', 'tenant_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id', 'tenant_id'];
          },
          {
            foreignKeyName: 'payments_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      membership_plans: {
        Row: {
          created_at: string;
          duration_months: number;
          id: string;
          is_active: boolean;
          name: string;
          price_minor: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          duration_months: number;
          id?: string;
          is_active?: boolean;
          name: string;
          price_minor: number;
          tenant_id: string;
        };
        Update: {
          duration_months?: number;
          is_active?: boolean;
          name?: string;
          price_minor?: number;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          created_at: string;
          currency: string;
          email: string | null;
          id: string;
          is_attendance_enabled: boolean;
          address: string | null;
          name: string;
          support_phone: string | null;
          upi_id: string | null;
          phone: string | null;
          slug: string;
          status: Database['public']['Enums']['tenant_status'];
          subscription_expires_at: string | null;
          subscription_plan: string | null;
          tenant_id: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          email?: string | null;
          id?: string;
          is_attendance_enabled?: boolean;
          name: string;
          phone?: string | null;
          slug: string;
          status?: Database['public']['Enums']['tenant_status'];
          subscription_expires_at?: string | null;
          subscription_plan?: string | null;
          tenant_id?: never;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          support_phone?: string | null;
          upi_id?: string | null;
          created_at?: string;
          currency?: string;
          email?: string | null;
          id?: string;
          is_attendance_enabled?: boolean;
          name?: string;
          phone?: string | null;
          slug?: string;
          status?: Database['public']['Enums']['tenant_status'];
          subscription_expires_at?: string | null;
          subscription_plan?: string | null;
          tenant_id?: never;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          commission_rate_pct: number;
          created_at: string;
          full_name: string;
          id: string;
          is_active: boolean;
          phone_number: string | null;
          role: Database['public']['Enums']['user_role'];
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          commission_rate_pct?: number;
          created_at?: string;
          full_name: string;
          id: string;
          is_active?: boolean;
          phone_number?: string | null;
          role: Database['public']['Enums']['user_role'];
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          commission_rate_pct?: number;
          created_at?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          phone_number?: string | null;
          role?: Database['public']['Enums']['user_role'];
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'users_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      check_in_member: {
        Args: {
          p_member_id: string;
          p_prevent_duplicate_same_day?: boolean;
          p_tenant_id: string;
        };
        Returns: Database['public']['Tables']['attendance']['Row'];
      };
      register_member_split_payment: {
        Args: {
          p_cash_minor?: number;
          p_due_settlement_date?: string | null;
          p_full_name: string;
          p_membership_expires_on: string;
          p_membership_started_on: string;
          p_phone_number: string;
          p_tenant_id: string;
          p_total_due_minor: number;
          p_upi_minor?: number;
        };
        Returns: {
          balance_due_minor: number;
          member_code: string;
          member_id: string;
          payment_id: string | null;
        }[];
      };
      collect_split_payment: {
        Args: {
          p_cash_minor: number;
          p_due_settlement_date?: string | null;
          p_duration_days?: number | null;
          p_gap_reason?: string | null;
          p_member_id: string;
          p_pending_payment_id?: string | null;
          p_start_mode?: string | null;
          p_tenant_id: string;
          p_total_due_minor: number;
          p_upi_minor: number;
        };
        Returns: Database['public']['Tables']['payments']['Row'];
      };
      freeze_member_plan: {
        Args: {
          p_freeze_start: string;
          p_member_id: string;
          p_reason: string;
          p_resume_on: string;
          p_tenant_id: string;
        };
        Returns: Database['public']['Tables']['members']['Row'];
      };
      resume_member_early: {
        Args: { p_member_id: string; p_tenant_id: string };
        Returns: Database['public']['Tables']['members']['Row'];
      };
      resume_due_memberships: {
        Args: { p_tenant_id: string };
        Returns: number;
      };
      handover_shift: {
        Args: { p_notes?: string | null; p_shift_id: string };
        Returns: Database['public']['Tables']['shifts']['Row'];
      };
      verify_and_lock_shift: {
        Args: { p_actual_cash_minor: number; p_notes?: string | null; p_shift_id: string };
        Returns: Database['public']['Tables']['shifts']['Row'];
      };
      review_expense: {
        Args: { p_action: ExpenseReviewAction; p_expense_id: string; p_reason?: string | null };
        Returns: Database['public']['Tables']['expenses']['Row'];
      };
      create_staff_member: {
        Args: { p_name: string; p_passcode: string; p_phone: string; p_role: string };
        Returns: Database['public']['Tables']['users']['Row'];
      };
      get_owner_dashboard_aggregates: {
        Args: { p_tenant_id: string };
        Returns: {
          cash_today_minor: number;
          collections_today_minor: number;
          difference_staff_name: string | null;
          drawer_cash_minor: number;
          drawer_difference_minor: number;
          dues_member_count: number;
          dues_total_minor: number;
          open_shift_staff_name: string | null;
          open_shift_started_at: string | null;
          overdue_member_count: number;
          pending_expense_count: number;
          pending_expense_minor: number;
          upi_today_minor: number;
        }[];
      };
      search_members_and_receipts: {
        Args: { p_limit?: number; p_query: string; p_tenant_id: string };
        Returns: {
          amount_minor: number | null;
          balance_due_minor: number | null;
          due_settlement_date: string | null;
          full_name: string;
          kind: string;
          member_code: string;
          member_id: string;
          membership_expires_on: string;
          payment_id: string | null;
          pending_payment_id: string | null;
          phone_number: string;
          receipt_number: string | null;
          security_code: string | null;
          status: string;
        }[];
      };
      verify_receipt_authenticity: {
        Args: { p_query: string };
        Returns: ReceiptAuthenticity[];
      };
      quick_renew_member: {
        Args: {
          p_amount_minor: number;
          p_extend_days?: number;
          p_member_id: string;
          p_method: Database['public']['Enums']['payment_method'];
          p_notes?: string | null;
          p_tenant_id: string;
        };
        Returns: Database['public']['Tables']['payments']['Row'];
      };
      verify_payment_receipt: {
        Args: { p_payment_id: string };
        Returns: Array<{
          amount_minor: number;
          currency: string;
          gym_name: string;
          is_verified: boolean;
          member_code: string;
          member_name: string;
          next_expiry_date: string;
          paid_at: string;
          payment_id: string;
          payment_method: Database['public']['Enums']['payment_method'];
          receipt_no: string;
          security_code: string;
        }>;
      };
    };
    Enums: {
      lead_status: 'new' | 'contacted' | 'trial_scheduled' | 'converted' | 'lost';
      notification_severity: 'high' | 'amber' | 'info' | 'neutral';
      expense_category: 'water_camper' | 'housekeeping' | 'staff_advance' | 'repairs' | 'other';
      attendance_source: 'reception' | 'self_check_in' | 'import' | 'system';
      member_status: 'active' | 'expired' | 'paused' | 'inactive';
      payment_method: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'other';
      payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'voided';
      tenant_status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
      user_role: 'receptionist' | 'owner' | 'superadmin' | 'trainer';
    };
    CompositeTypes: Record<string, never>;
  };
};

/** Lifecycle of a front-desk drawer shift. */
export type ShiftStatus = 'OPEN' | 'HANDED_OVER' | 'LOCKED';

/** Owner verification state for a petty-cash expense. */
export type ExpenseApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

/** Action accepted by the `review_expense` RPC. */
export type ExpenseReviewAction = 'APPROVE' | 'REJECT';

/** Settlement channel for a trainer commission payout. */
export type TrainerPayoutMode = 'CASH' | 'UPI' | 'BANK_TRANSFER';

/** Row returned by `verify_receipt_authenticity`. */
export type ReceiptAuthenticity = {
  amount_minor: number;
  cash_minor: number;
  created_at: string;
  currency: string;
  is_locked: boolean;
  issued_by: string;
  member_code: string;
  member_name: string;
  paid_at: string | null;
  payment_id: string;
  receipt_number: string;
  security_code: string;
  shift_status: string;
  tender_mode: 'CASH' | 'UPI' | 'SPLIT' | string;
  upi_minor: number;
};

export type PublicSchema = Database['public'];
export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];

/** Owner Cockpit row aliases. */
export type Shift = Database['public']['Tables']['shifts']['Row'];
export type ShiftInsert = Database['public']['Tables']['shifts']['Insert'];
export type TrainerPayout = Database['public']['Tables']['trainer_payouts']['Row'];
export type TrainerPayoutInsert = Database['public']['Tables']['trainer_payouts']['Insert'];
export type ExpenseRow = Database['public']['Tables']['expenses']['Row'];

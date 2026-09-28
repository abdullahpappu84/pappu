CREATE TYPE "public"."balance_type" AS ENUM('main', 'bonus');--> statement-breakpoint
CREATE TYPE "public"."bonus_type" AS ENUM('registration', 'deposit', 'free_spins', 'cashback', 'promotional', 'coupon');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('pending', 'approved', 'paid', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."game_display" AS ENUM('standard', 'live_table');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('active', 'inactive', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('none', 'pending', 'under_review', 'approved', 'rejected', 'resubmission');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('deposit', 'withdrawal', 'bonus', 'promotion', 'system', 'support', 'kyc', 'security');--> statement-breakpoint
CREATE TYPE "public"."payment_direction" AS ENUM('deposit', 'withdrawal', 'both');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'pending', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('pending', 'completed', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."tx_type" AS ENUM('deposit', 'withdrawal', 'bonus', 'cashback', 'refund', 'adjustment', 'commission', 'bet', 'win', 'bonus_conversion', 'bonus_forfeit', 'fee', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_bonus_status" AS ENUM('active', 'completed', 'expired', 'forfeited', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'pending', 'suspended', 'banned');--> statement-breakpoint
CREATE TYPE "public"."verification_type" AS ENUM('email_verify', 'password_reset', 'phone_verify');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_status" AS ENUM('pending', 'processing', 'approved', 'rejected', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"two_factor_secret" text,
	"two_factor_temp_secret" text,
	"recovery_codes" jsonb,
	"last_login_at" timestamp with time zone,
	"last_login_ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(255) NOT NULL,
	"code" varchar(24) NOT NULL,
	"commission_percent" numeric(5, 2) DEFAULT '10' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_email_unique" UNIQUE("email"),
	CONSTRAINT "agents_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"admin_email" varchar(255),
	"action" varchar(64) NOT NULL,
	"target_type" varchar(40),
	"target_id" varchar(64),
	"ip" varchar(64),
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" serial PRIMARY KEY NOT NULL,
	"eyebrow" varchar(80),
	"title" varchar(120) NOT NULL,
	"title_accent" varchar(120),
	"description" text,
	"cta_label" varchar(40) DEFAULT 'Play Now',
	"link" text DEFAULT '#games',
	"secondary_cta_label" varchar(40),
	"secondary_link" text,
	"desktop_image" text NOT NULL,
	"mobile_image" text,
	"image_position" varchar(32),
	"fit" varchar(12) DEFAULT 'cover' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"type" "bonus_type" NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"percentage" numeric(6, 2) DEFAULT '0' NOT NULL,
	"min_deposit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"max_bonus" numeric(18, 2) DEFAULT '0' NOT NULL,
	"wagering_multiplier" numeric(6, 2) DEFAULT '30' NOT NULL,
	"free_spins" integer DEFAULT 0 NOT NULL,
	"expiry_days" integer DEFAULT 30 NOT NULL,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"eligibility" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canned_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"short_label" varchar(40),
	"icon" varchar(40) DEFAULT 'LayoutGrid' NOT NULL,
	"color" varchar(16) DEFAULT '#f9cf66' NOT NULL,
	"badge" varchar(8),
	"show_in_slider" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" uuid,
	"agent_id" integer,
	"referred_user_id" uuid NOT NULL,
	"source_type" varchar(24) NOT NULL,
	"source_id" varchar(64) NOT NULL,
	"base_amount" numeric(18, 2) NOT NULL,
	"percent" numeric(5, 2) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"status" "commission_status" DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_source_uq" UNIQUE("source_type","source_id")
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(40) NOT NULL,
	"user_id" uuid NOT NULL,
	"payment_method_id" integer,
	"amount" numeric(18, 2) NOT NULL,
	"fee" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" "deposit_status" DEFAULT 'pending' NOT NULL,
	"proof_url" text,
	"bonus_id" integer,
	"promo_code" varchar(40),
	"user_note" text,
	"admin_note" text,
	"provider_reference" varchar(120),
	"charge_amount" numeric(18, 2),
	"charge_currency" varchar(8),
	"idempotency_key" varchar(80),
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_reference_unique" UNIQUE("reference"),
	CONSTRAINT "deposit_idem_uq" UNIQUE("user_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"game_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_game_id_pk" PRIMARY KEY("user_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "game_categories" (
	"game_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	CONSTRAINT "game_categories_game_id_category_id_pk" PRIMARY KEY("game_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"provider_id" integer,
	"thumbnail" text,
	"mobile_thumbnail" text,
	"banner" text,
	"description" text,
	"game_url" text,
	"integration_ref" varchar(120),
	"display_type" "game_display" DEFAULT 'standard' NOT NULL,
	"status" "game_status" DEFAULT 'active' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_popular" boolean DEFAULT false NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"is_hot" boolean DEFAULT false NOT NULL,
	"badge" varchar(12),
	"rtp" numeric(5, 2) DEFAULT '96.00' NOT NULL,
	"volatility" varchar(16) DEFAULT 'Medium' NOT NULL,
	"max_win" varchar(32) DEFAULT '1,000x' NOT NULL,
	"art" jsonb,
	"meta" jsonb,
	"play_count" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "kyc_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"date_of_birth" varchar(16) NOT NULL,
	"country" varchar(64) NOT NULL,
	"address" text NOT NULL,
	"document_type" varchar(32) NOT NULL,
	"document_number" varchar(64) NOT NULL,
	"front_url" text,
	"back_url" text,
	"selfie_url" text,
	"admin_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" DEFAULT 'system' NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"title" varchar(160) NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"meta_title" varchar(160),
	"meta_description" text,
	"is_published" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"code" varchar(40) NOT NULL,
	"direction" "payment_direction" DEFAULT 'both' NOT NULL,
	"adapter" varchar(40) DEFAULT 'manual' NOT NULL,
	"logo_url" text,
	"instructions" text,
	"account_details" text,
	"min_amount" numeric(18, 2) DEFAULT '10' NOT NULL,
	"max_amount" numeric(18, 2) DEFAULT '10000' NOT NULL,
	"fee_percent" numeric(6, 2) DEFAULT '0' NOT NULL,
	"fee_fixed" numeric(18, 2) DEFAULT '0' NOT NULL,
	"processing_time" varchar(64) DEFAULT 'Instant',
	"requires_proof" boolean DEFAULT false NOT NULL,
	"fields" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"group" varchar(32) NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"date_of_birth" varchar(16),
	"country" varchar(64),
	"city" varchar(64),
	"address" text,
	"postal_code" varchar(16),
	"language" varchar(8) DEFAULT 'EN',
	"currency" varchar(8) DEFAULT 'EUR',
	"marketing_opt_in" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"description" text,
	"bonus_type" "bonus_type" DEFAULT 'coupon' NOT NULL,
	"bonus_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"percentage" numeric(6, 2) DEFAULT '0' NOT NULL,
	"min_deposit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"max_bonus" numeric(18, 2) DEFAULT '0' NOT NULL,
	"wagering_multiplier" numeric(6, 2) DEFAULT '20' NOT NULL,
	"free_spins" integer DEFAULT 0 NOT NULL,
	"max_usage" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"eligibility" jsonb,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "promo_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"user_bonus_id" uuid,
	"deposit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_red_deposit_uq" UNIQUE("deposit_id")
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"title" varchar(120) NOT NULL,
	"value" varchar(120) NOT NULL,
	"note" varchar(120),
	"icon" varchar(40) DEFAULT 'Gift' NOT NULL,
	"description" text,
	"banner_image" text,
	"bonus_id" integer,
	"eligibility" jsonb,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"logo_url" text,
	"adapter" varchar(40) DEFAULT 'direct' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_name_unique" UNIQUE("name"),
	CONSTRAINT "providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "recently_played" (
	"user_id" uuid NOT NULL,
	"game_id" integer NOT NULL,
	"play_count" integer DEFAULT 1 NOT NULL,
	"last_played_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recently_played_user_id_game_id_pk" PRIMARY KEY("user_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" uuid,
	"agent_id" integer,
	"referred_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_referred_id_unique" UNIQUE("referred_id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" integer NOT NULL,
	"permission_id" integer NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name"),
	CONSTRAINT "roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"sender_type" varchar(12) NOT NULL,
	"sender_id" uuid,
	"sender_name" varchar(120),
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(40) NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" varchar(200) NOT NULL,
	"category" varchar(40) DEFAULT 'general' NOT NULL,
	"channel" varchar(16) DEFAULT 'ticket' NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'normal' NOT NULL,
	"assigned_to" uuid,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(40) NOT NULL,
	"external_ref" varchar(160),
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"type" "tx_type" NOT NULL,
	"balance_type" "balance_type" DEFAULT 'main' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"balance_before" numeric(18, 2) NOT NULL,
	"balance_after" numeric(18, 2) NOT NULL,
	"status" "tx_status" DEFAULT 'completed' NOT NULL,
	"description" text,
	"related_type" varchar(32),
	"related_id" varchar(64),
	"admin_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_reference_unique" UNIQUE("reference"),
	CONSTRAINT "transactions_external_ref_unique" UNIQUE("external_ref")
);
--> statement-breakpoint
CREATE TABLE "user_bonuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bonus_id" integer,
	"promo_code_id" integer,
	"deposit_id" uuid,
	"type" "bonus_type" NOT NULL,
	"name" varchar(120) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"free_spins" integer DEFAULT 0 NOT NULL,
	"wagering_required" numeric(18, 2) DEFAULT '0' NOT NULL,
	"wagering_completed" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" "user_bonus_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ub_deposit_uq" UNIQUE("deposit_id")
);
--> statement-breakpoint
CREATE TABLE "user_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"admin_id" uuid,
	"admin_name" varchar(120),
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"admin_id" uuid NOT NULL,
	"role_id" integer NOT NULL,
	CONSTRAINT "user_roles_admin_id_role_id_pk" PRIMARY KEY("admin_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(32),
	"password_hash" text,
	"avatar_url" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"phone_verified_at" timestamp with time zone,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"two_factor_secret" text,
	"two_factor_temp_secret" text,
	"recovery_codes" jsonb,
	"referral_code" varchar(16) NOT NULL,
	"referred_by_id" uuid,
	"referral_disabled" boolean DEFAULT false NOT NULL,
	"kyc_status" "kyc_status" DEFAULT 'none' NOT NULL,
	"google_id" varchar(64),
	"facebook_id" varchar(64),
	"last_login_at" timestamp with time zone,
	"last_login_ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_facebook_id_unique" UNIQUE("facebook_id")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "verification_type" NOT NULL,
	"token_hash" text NOT NULL,
	"target" varchar(255),
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "vip_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(40) NOT NULL,
	"level" integer NOT NULL,
	"min_points" integer DEFAULT 0 NOT NULL,
	"cashback_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"rewards" text,
	"benefits" jsonb,
	"color" varchar(16) DEFAULT '#f9cf66' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vip_levels_level_unique" UNIQUE("level")
);
--> statement-breakpoint
CREATE TABLE "vip_users" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"level_id" integer,
	"points" integer DEFAULT 0 NOT NULL,
	"lifetime_points" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"currency" varchar(8) DEFAULT 'EUR' NOT NULL,
	"main_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"bonus_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "wallet_main_non_negative" CHECK ("wallets"."main_balance" >= 0),
	CONSTRAINT "wallet_bonus_non_negative" CHECK ("wallets"."bonus_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(40) NOT NULL,
	"user_id" uuid NOT NULL,
	"payment_method_id" integer,
	"amount" numeric(18, 2) NOT NULL,
	"fee" numeric(18, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(18, 2) NOT NULL,
	"status" "withdrawal_status" DEFAULT 'pending' NOT NULL,
	"payment_details" jsonb,
	"user_note" text,
	"admin_note" text,
	"hold_transaction_id" uuid,
	"provider_reference" varchar(120),
	"idempotency_key" varchar(80),
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawals_reference_unique" UNIQUE("reference"),
	CONSTRAINT "withdrawal_idem_uq" UNIQUE("user_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_categories" ADD CONSTRAINT "game_categories_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_categories" ADD CONSTRAINT "game_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_user_bonus_id_user_bonuses_id_fk" FOREIGN KEY ("user_bonus_id") REFERENCES "public"."user_bonuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_bonus_id_bonuses_id_fk" FOREIGN KEY ("bonus_id") REFERENCES "public"."bonuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recently_played" ADD CONSTRAINT "recently_played_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recently_played" ADD CONSTRAINT "recently_played_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_users_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_admin_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bonuses" ADD CONSTRAINT "user_bonuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bonuses" ADD CONSTRAINT "user_bonuses_bonus_id_bonuses_id_fk" FOREIGN KEY ("bonus_id") REFERENCES "public"."bonuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bonuses" ADD CONSTRAINT "user_bonuses_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_id_users_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vip_users" ADD CONSTRAINT "vip_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vip_users" ADD CONSTRAINT "vip_users_level_id_vip_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."vip_levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "audit_time_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "commission_status_idx" ON "commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deposit_provider_ref_idx" ON "deposits" USING btree ("provider_reference");--> statement-breakpoint
CREATE INDEX "deposit_status_idx" ON "deposits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deposit_user_idx" ON "deposits" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status");--> statement-breakpoint
CREATE INDEX "games_provider_idx" ON "games" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "integrations_kind_idx" ON "integrations" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "kyc_status_idx" ON "kyc_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kyc_user_idx" ON "kyc_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notif_user_time_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "promo_red_user_idx" ON "promo_redemptions" USING btree ("promo_code_id","user_id");--> statement-breakpoint
CREATE INDEX "recent_user_time_idx" ON "recently_played" USING btree ("user_id","last_played_at");--> statement-breakpoint
CREATE INDEX "ref_referrer_idx" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "ref_agent_idx" ON "referrals" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "msg_ticket_idx" ON "support_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ticket_user_idx" ON "support_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tx_user_time_idx" ON "transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tx_type_idx" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "tx_related_idx" ON "transactions" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE INDEX "ub_user_status_idx" ON "user_bonuses" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "user_notes_user_idx" ON "user_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "verif_user_type_idx" ON "verification_tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "withdrawal_status_idx" ON "withdrawals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "withdrawal_user_idx" ON "withdrawals" USING btree ("user_id","created_at");
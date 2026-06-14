CREATE TABLE "admin_notification_state" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"last_digest_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text
);
--> statement-breakpoint
CREATE TABLE "catalog_item_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"normalized_name" text NOT NULL,
	"display_name" text NOT NULL,
	"catalog_item_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_item_aliases_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_name" text NOT NULL,
	"icon" text,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_store_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"normalized_name" text NOT NULL,
	"display_name" text NOT NULL,
	"catalog_store_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_store_aliases_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
CREATE TABLE "catalog_stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_name" text NOT NULL,
	"logo" text,
	"website_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'general' NOT NULL,
	"country_code" text,
	"state_code" text,
	"subscription_status" text,
	"subscription_provider" text,
	"subscription_current_period_end" timestamp with time zone,
	"trial_started_at" timestamp with time zone,
	"plan_selected_at" timestamp with time zone,
	"annual_offer_dismissed_at" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"paypal_subscription_id" text,
	"comp_access" boolean DEFAULT false NOT NULL,
	"notify_payment_reminders" boolean DEFAULT false NOT NULL,
	"notify_list_export" boolean DEFAULT false NOT NULL,
	"notify_receipt_reminders" boolean DEFAULT false NOT NULL,
	"notify_spend_summary" boolean DEFAULT false NOT NULL,
	"notify_list_export_frequency" text DEFAULT 'weekly',
	"notify_receipt_reminders_frequency" text DEFAULT 'weekly',
	"notify_spend_summary_frequency" text DEFAULT 'weekly',
	"last_trial_ending_sent_at" timestamp with time zone,
	"last_weekly_summary_sent_at" timestamp,
	"last_monthly_summary_sent_at" timestamp,
	"last_past_due_sent_at" timestamp with time zone,
	"last_list_export_sent_at" timestamp with time zone,
	"last_receipt_inactivity_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"country_code" text,
	"state_code" text,
	"address" text,
	"phone" text,
	"open_times" text,
	"delivery_available" boolean DEFAULT false NOT NULL,
	"delivery_fee" numeric(10, 2),
	"minimum_order_amount" numeric(10, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"icon" text,
	"category" text,
	"notes" text,
	"purchase_count" integer DEFAULT 0 NOT NULL,
	"ran_out_at" timestamp with time zone,
	"added_to_list_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"global_price" numeric,
	"global_store_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"store_id" integer NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"total_before_tax" numeric(10, 2),
	"image_uri" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"quantity" numeric(10, 3) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_posts" ADD CONSTRAINT "board_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_aliases" ADD CONSTRAINT "catalog_item_aliases_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_store_aliases" ADD CONSTRAINT "catalog_store_aliases_catalog_store_id_catalog_stores_id_fk" FOREIGN KEY ("catalog_store_id") REFERENCES "public"."catalog_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_single_admin_idx" ON "users" USING btree ("is_admin") WHERE "users"."is_admin";
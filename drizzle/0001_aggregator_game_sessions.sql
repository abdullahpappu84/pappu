CREATE TABLE "aggregator_game_sessions" (
	"aggregator_session_id" varchar(64) PRIMARY KEY NOT NULL,
	"aggregator_player_id" varchar(128) NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aggregator_game_sessions" ADD CONSTRAINT "aggregator_game_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "aggregator_game_sessions_player_idx" ON "aggregator_game_sessions" USING btree ("aggregator_player_id","aggregator_session_id");

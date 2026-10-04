INSERT INTO categories (name, slug, icon, color, show_in_slider, is_active, sort_order)
VALUES ('Bonus & Wagering', 'bonus-wagering', 'Gift', '#fb923c', true, true, 100)
ON CONFLICT (slug) DO NOTHING;

CREATE INDEX IF NOT EXISTS transactions_recent_game_wins_idx
  ON transactions (((metadata->>'gameId')::int), created_at DESC)
  WHERE type = 'win' AND metadata->>'gameId' IS NOT NULL;

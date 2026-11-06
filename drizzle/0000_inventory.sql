CREATE TABLE items (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  minimum INTEGER NOT NULL CHECK(minimum BETWEEN 0 AND 1000000000),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock BETWEEN 0 AND 1000000000),
  UNIQUE (owner, sku),
  UNIQUE (owner, id)
);
--> statement-breakpoint
CREATE TABLE movements (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  item_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('in', 'out', 'count')),
  delta INTEGER NOT NULL,
  balance INTEGER NOT NULL CHECK(balance BETWEEN 0 AND 1000000000),
  note TEXT NOT NULL,
  at TEXT NOT NULL,
  FOREIGN KEY (owner, item_id) REFERENCES items(owner, id)
);
--> statement-breakpoint
CREATE INDEX movements_owner_at ON movements(owner, at DESC);
--> statement-breakpoint
CREATE TRIGGER apply_movement AFTER INSERT ON movements
BEGIN
  UPDATE items SET stock = NEW.balance WHERE owner = NEW.owner AND id = NEW.item_id;
END;

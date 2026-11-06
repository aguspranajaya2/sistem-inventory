CREATE TABLE import_batches (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  digest TEXT NOT NULL,
  PRIMARY KEY (owner, id)
);

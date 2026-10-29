CREATE TABLE IF NOT EXISTS patrac_legal_acceptance(user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE, kind TEXT NOT NULL, reference TEXT NOT NULL, version TEXT NOT NULL, terms_snapshot TEXT NOT NULL, accepted_at INTEGER NOT NULL, PRIMARY KEY(user_id,kind,reference,version));
CREATE TABLE IF NOT EXISTS patrac_purchase_mail(order_id TEXT PRIMARY KEY,sent_at INTEGER NOT NULL);

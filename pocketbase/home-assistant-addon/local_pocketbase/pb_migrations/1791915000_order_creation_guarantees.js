migrate((app) => {
  const orders = app.findCollectionByNameOrId("orders");
  orders.createRule = '@request.auth.role = "admin"';
  app.save(orders);

  // Restore the PostgreSQL defaults that were lost during the PocketBase
  // migration before enforcing uniqueness.
  app.db().newQuery(`
    UPDATE orders
    SET customer_order_token = lower(hex(randomblob(32)))
    WHERE customer_order_token = '' OR customer_order_token IS NULL
  `).execute();
  app.db().newQuery(`
    UPDATE orders
    SET status = 'submitted'
    WHERE status = '' OR status IS NULL
  `).execute();
  app.db().newQuery(`
    UPDATE orders
    SET
      submitted_at = CASE WHEN submitted_at = '' OR submitted_at IS NULL THEN strftime('%Y-%m-%d %H:%M:%fZ', 'now') ELSE submitted_at END,
      created_at = CASE WHEN created_at = '' OR created_at IS NULL THEN strftime('%Y-%m-%d %H:%M:%fZ', 'now') ELSE created_at END,
      updated_at = CASE WHEN updated_at = '' OR updated_at IS NULL THEN strftime('%Y-%m-%d %H:%M:%fZ', 'now') ELSE updated_at END
  `).execute();
  app.db().newQuery("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number_unique ON orders (order_number) WHERE order_number != ''").execute();
  app.db().newQuery("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_customer_token_unique ON orders (customer_order_token) WHERE customer_order_token != ''").execute();
}, (app) => {
  app.db().newQuery("DROP INDEX IF EXISTS idx_orders_customer_token_unique").execute();
  app.db().newQuery("DROP INDEX IF EXISTS idx_orders_order_number_unique").execute();
  const orders = app.findCollectionByNameOrId("orders");
  orders.createRule = "";
  app.save(orders);
});

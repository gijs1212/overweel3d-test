migrate((app) => {
  let collection;
  try {
    collection = app.findCollectionByNameOrId("product_admin_sources");
  } catch (_) {
    const adminRule = '@request.auth.role = "admin"';
    collection = new Collection({
      type: "base",
      name: "product_admin_sources",
      listRule: adminRule,
      viewRule: adminRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
    });
  }

  const adminRule = '@request.auth.role = "admin"';
  collection.listRule = adminRule;
  collection.viewRule = adminRule;
  collection.createRule = adminRule;
  collection.updateRule = adminRule;
  collection.deleteRule = adminRule;
  if (!collection.fields.getByName("product_id")) collection.fields.add(new TextField({ name: "product_id", required: true }));
  if (!collection.fields.getByName("makerworld_url")) collection.fields.add(new TextField({ name: "makerworld_url" }));
  if (!collection.fields.getByName("three_mf_path")) collection.fields.add(new TextField({ name: "three_mf_path" }));
  if (!collection.fields.getByName("three_mf_filename")) collection.fields.add(new TextField({ name: "three_mf_filename" }));
  const uniqueIndex = "CREATE UNIQUE INDEX idx_product_admin_sources_product ON product_admin_sources (product_id)";
  if ((collection.indexes || []).indexOf(uniqueIndex) < 0) collection.indexes = (collection.indexes || []).concat([uniqueIndex]);
  app.save(collection);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("product_admin_sources"));
  } catch (_) {
    // Already removed.
  }
});

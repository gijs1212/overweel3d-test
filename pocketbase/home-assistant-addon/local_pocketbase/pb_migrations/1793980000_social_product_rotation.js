migrate((app) => {
  const collection = app.findCollectionByNameOrId("social_publisher_settings");
  if (!collection.fields.getByName("product_fingerprints")) collection.fields.add(new JSONField({ name: "product_fingerprints", maxSize: 2000000 }));
  if (!collection.fields.getByName("product_fingerprints_initialized")) collection.fields.add(new BoolField({ name: "product_fingerprints_initialized" }));
  if (!collection.fields.getByName("spotlight_recent_product_ids")) collection.fields.add(new JSONField({ name: "spotlight_recent_product_ids", maxSize: 10000 }));
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("social_publisher_settings");
  ["product_fingerprints", "product_fingerprints_initialized", "spotlight_recent_product_ids"].forEach((name) => {
    const field = collection.fields.getByName(name);
    if (field) collection.fields.removeById(field.id);
  });
  app.save(collection);
});

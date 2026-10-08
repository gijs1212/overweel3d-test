migrate((app) => {
  const collection = app.findCollectionByNameOrId("social_publisher_settings");
  if (!collection.fields.getByName("publisher_last_seen_at")) collection.fields.add(new DateField({ name: "publisher_last_seen_at" }));
  if (!collection.fields.getByName("publisher_version")) collection.fields.add(new TextField({ name: "publisher_version" }));
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("social_publisher_settings");
  ["publisher_last_seen_at", "publisher_version"].forEach((name) => {
    const field = collection.fields.getByName(name);
    if (field) collection.fields.removeById(field.id);
  });
  app.save(collection);
});

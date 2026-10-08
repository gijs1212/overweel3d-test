migrate((app) => {
  const collection = app.findCollectionByNameOrId("social_publisher_sessions");
  if (!collection.fields.getByName("account_name")) collection.fields.add(new TextField({ name: "account_name" }));
  if (!collection.fields.getByName("account_url")) collection.fields.add(new TextField({ name: "account_url" }));
  if (!collection.fields.getByName("check_steps")) collection.fields.add(new JSONField({ name: "check_steps", maxSize: 200000 }));
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("social_publisher_sessions");
  ["account_name", "account_url", "check_steps"].forEach((name) => {
    const field = collection.fields.getByName(name);
    if (field) collection.fields.removeById(field.id);
  });
  app.save(collection);
});

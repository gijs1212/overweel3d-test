migrate((app) => {
  const collection = app.findCollectionByNameOrId("social_publisher_settings");
  if (!collection.fields.getByName("facebook_media_mode")) {
    collection.fields.add(new TextField({ name: "facebook_media_mode" }));
    app.save(collection);
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("social_publisher_settings");
  const field = collection.fields.getByName("facebook_media_mode");
  if (field) {
    collection.fields.removeById(field.id);
    app.save(collection);
  }
});

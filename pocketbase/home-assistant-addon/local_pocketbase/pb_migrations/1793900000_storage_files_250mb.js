migrate((app) => {
  const collection = app.findCollectionByNameOrId("storage_files");
  const fileField = collection.fields.getByName("file");
  if (!fileField) throw new Error("storage_files.file ontbreekt");
  fileField.maxSize = 250 * 1024 * 1024;
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("storage_files");
  const fileField = collection.fields.getByName("file");
  if (!fileField) return;
  fileField.maxSize = 100 * 1024 * 1024;
  app.save(collection);
});

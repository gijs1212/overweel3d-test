migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.authToken) throw new Error("users.authToken ontbreekt");
  // The browser renews this token every four minutes while the dashboard is
  // active. Thirty days also covers tablets that are not opened every day.
  users.authToken.duration = 30 * 24 * 60 * 60;
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.authToken) return;
  users.authToken.duration = 14 * 24 * 60 * 60;
  app.save(users);
});

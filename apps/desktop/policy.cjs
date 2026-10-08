const path = require("node:path");
exports.senderAllowed = (url) => url === "nova://app/index.html";
exports.assetPath = (url, root) => {
  const u = new URL(url);
  if (u.protocol !== "nova:" || u.hostname !== "app")
    throw new Error("Invalid app origin");
  const name =
    decodeURIComponent(u.pathname).replace(/^\//, "") || "index.html";
  if (!["index.html", "app.js", "style.css"].includes(name))
    throw new Error("Unknown app asset");
  return path.join(root, name);
};
exports.releaseURL = (url) => {
  const u = new URL(url);
  return (
    u.protocol === "https:" &&
    u.hostname === "github.com" &&
    !u.username &&
    !u.password &&
    u.pathname.startsWith("/seven0070/nova/releases/")
  );
};
exports.checkText = (value, max = 8000) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("Invalid text");
  return value;
};

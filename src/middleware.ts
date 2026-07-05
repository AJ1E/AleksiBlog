import { defineMiddleware } from "astro:middleware";
import { readAuthFromCookies } from "./lib/auth";

export const onRequest = defineMiddleware((context, next) => {
  if (context.url.pathname === "/about") {
    return context.redirect("/about/", 301);
  }

  context.locals.auth = { isAuthed: readAuthFromCookies(context.cookies) };
  return next();
});

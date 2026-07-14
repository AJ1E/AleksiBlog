import { defineMiddleware } from "astro:middleware";
import { readAuthFromCookies } from "./lib/auth";

export const onRequest = defineMiddleware((context, next) => {
  if (context.url.pathname === "/about") {
    return context.redirect("/about/", 301);
  }

  // Cookies are unavailable while Astro builds prerendered pages.
  context.locals.auth = {
    isAuthed: context.isPrerendered ? false : readAuthFromCookies(context.cookies),
  };
  return next();
});

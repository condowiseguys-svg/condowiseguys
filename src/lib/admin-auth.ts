import "server-only";
import { headers } from "next/headers";
import { isAuthorized } from "@/middleware";

/** Second check inside admin server actions, in case a request reaches them some other way. */
export async function assertAdmin() {
  const password = process.env.ADMIN_PASSWORD;
  const h = await headers();
  if (!password || !isAuthorized(h.get("authorization"), process.env.ADMIN_USER || "brian", password)) {
    throw new Error("Not authorized");
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { ROLE_COOKIE } from "@/lib/role";

// The manager's text links to /c/<id>/manager?as=manager (packages/engine/src/messages/summary.ts). A phone that
// taps it has no role cookie, which reads as the owner, so one tap on Home would show pay. Set the manager role
// here, before anything renders, and redirect to the clean URL. Same cookie and lifetime as the role switch.
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.searchParams.delete("as");
  const response = NextResponse.redirect(url);
  response.cookies.set(ROLE_COOKIE, "manager", {
    path: "/",
    maxAge: 86400,
    sameSite: "lax",
  });
  return response;
}

export const config = {
  matcher: [
    {
      source: "/c/:companyId/manager",
      has: [{ type: "query", key: "as", value: "manager" }],
    },
  ],
};

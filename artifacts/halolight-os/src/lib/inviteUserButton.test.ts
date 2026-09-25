import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { apiErrorStatus } from "./apiErrorMessage";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../components/InviteUserButton.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

function harness() {
  const requests: unknown[] = [];
  const notices: any[] = [];
  const invalidations: unknown[] = [];
  const mutation = {
    isPending: false,
    isSuccess: false,
    mutate: (args: unknown) => requests.push(args),
  };
  let handlers: any;
  const deps: Record<string, unknown> = {
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@tanstack/react-query": {
      useQueryClient: () => ({
        invalidateQueries: (args: unknown) => invalidations.push(args),
      }),
    },
    "@workspace/api-client-react": {
      useInviteUser: (options: any) => {
        handlers = options.mutation;
        return mutation;
      },
    },
    "react-i18next": { useTranslation: () => ({ t: (key: string) => key }) },
    "lucide-react": { Loader2: () => null, Mail: () => null },
    "@/components/ui/button": { Button: () => null },
    "@/hooks/use-toast": {
      useToast: () => ({ toast: (notice: unknown) => notices.push(notice) }),
    },
    "@/lib/apiErrorMessage": { apiErrorStatus },
  };
  const module = { exports: {} as any };
  new Function("require", "module", "exports", compiled)(
    (id: string) => {
      assert.ok(id in deps, id);
      return deps[id];
    },
    module,
    module.exports,
  );
  return {
    requests,
    notices,
    invalidations,
    mutation,
    get handlers() {
      return handlers;
    },
    render: (isActive = true) =>
      module.exports.InviteUserButton({
        user: { id: "existing-user", isActive },
      }),
  };
}

test("inviting is explicit, uses existing user id, and disables inactive, pending, and sent buttons", () => {
  const h = harness();
  const button = h.render();
  assert.deepEqual(h.requests, []);
  assert.equal(button.props.disabled, false);
  assert.equal(button.props.children[1], "auth.send_invite");
  button.props.onClick();
  assert.deepEqual(h.requests, [{ id: "existing-user" }]);
  assert.equal(h.render(false).props.disabled, true);
  h.mutation.isPending = true;
  assert.equal(h.render().props.disabled, true);
  h.mutation.isPending = false;
  h.mutation.isSuccess = true;
  assert.equal(h.render().props.disabled, true);
  assert.equal(h.render().props.children[1], "auth.invite_sent");
});

test("invitation success refreshes its session's user list; errors expose only translated messages", () => {
  const h = harness();
  h.render();
  h.handlers.onSuccess();
  assert.deepEqual(h.invalidations, [{ queryKey: ["/api/users"] }]);
  assert.equal(h.notices[0].title, "auth.invite_sent");
  for (const [status, key] of [
    [409, "auth.invite_conflict"],
    [503, "auth.invite_unavailable"],
    [500, "auth.invite_failed"],
  ]) {
    h.handlers.onError({ status, data: { error: "provider diagnostic" } });
    assert.equal(h.notices.at(-1).title, key);
    assert.equal(h.notices.at(-1).variant, "destructive");
  }
  assert.ok(!JSON.stringify(h.notices).includes("provider diagnostic"));
});

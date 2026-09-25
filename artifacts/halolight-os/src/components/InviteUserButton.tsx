import { useQueryClient } from "@tanstack/react-query";
import { useInviteUser } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiErrorStatus } from "@/lib/apiErrorMessage";

export function InviteUserButton({
  user,
}: {
  user: { id: string; isActive: boolean };
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const client = useQueryClient();
  const invite = useInviteUser({
    mutation: {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: ["/api/users"] });
        toast({
          title: t("auth.invite_sent", { defaultValue: "Invitation sent" }),
        });
      },
      onError: (error) => {
        const status = apiErrorStatus(error);
        toast({
          variant: "destructive",
          title:
            status === 409
              ? t("auth.invite_conflict", {
                  defaultValue: "This account is inactive or already linked.",
                })
              : status === 503
                ? t("auth.invite_unavailable", {
                    defaultValue:
                      "Invitations are unavailable. Try again later.",
                  })
                : t("auth.invite_failed", {
                    defaultValue: "Unable to send the invitation.",
                  }),
        });
      },
    },
  });
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      disabled={!user.isActive || invite.isPending || invite.isSuccess}
      onClick={() => invite.mutate({ id: user.id })}
      data-testid={`invite-user-${user.id}`}
    >
      {invite.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Mail className="h-4 w-4" />
      )}
      {invite.isSuccess
        ? t("auth.invite_sent", { defaultValue: "Invitation sent" })
        : t("auth.send_invite", { defaultValue: "Send invitation" })}
    </Button>
  );
}

import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("not_found.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("not_found.description")}
        </p>
      </div>
    </div>
  );
}

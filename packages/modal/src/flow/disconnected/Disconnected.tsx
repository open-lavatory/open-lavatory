import { LucideSettings } from "lucide-solid";

import { useSessionStart } from "../../hooks/useSession.js";
import { Button } from "../../ui/Button.js";
import { useTranslation } from "../../utils/i18n.js";
import { ConnectionGraphic } from "./ConnectionGraphic.js";

export const Disconnected = (properties: { onSettings: () => void; }) => {
  const { t } = useTranslation();
  const { start } = useSessionStart();

  return (
    <div class="flex flex-col items-center gap-4 p-6">
      <ConnectionGraphic />
      <div class="text-center">
        <p class="text-sm text-(--lv-text-secondary)">
          {t("disconnected.prompt")}
        </p>
      </div>
      <div class="flex items-center">
        <Button
          type="button"
          onClick={start}
          class="z-10 px-6 py-3"
          $variant="primary"
          $size="lg"
        >
          {t("disconnected.generateQr")}
        </Button>
        <Button
          type="button"
          aria-label={String(t("disconnected.connectionSettings"))}
          aria-pressed={false}
          onClick={properties.onSettings}
          class="px-3 ltr:-ml-1 ltr:rounded-l-none rtl:-mr-1 rtl:rounded-r-none"
          $aspect="square"
          $size="lg"
          $variant="secondary"
        >
          <LucideSettings class="h-5 w-5 text-(--lv-text-muted)" />
        </Button>
      </div>
    </div>
  );
};

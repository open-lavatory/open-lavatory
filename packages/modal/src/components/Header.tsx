import { LucideChevronLeft, LucideCircleQuestionMark, LucideX } from "lucide-solid";

import { Button } from "../ui/Button.js";
import { useTranslation } from "../utils/i18n.js";
import type { ModalView } from "./ModalRoot.js";

export const Header = (properties: {
  title: string;
  view: ModalView;
  onClose: () => void;
  onBack?: () => void;
  setView: (view: ModalView) => void;
}) => {
  const { t } = useTranslation();

  return (
    <div class="flex items-center justify-between px-2 py-2">
      {properties.onBack
        ? (
            <Button
              onClick={properties.onBack}
              aria-label={String(
                properties.view === "settings"
                  ? t("modal.backToQr")
                  : t("modal.closeModal"),
              )}
              $variant="tertiary"
              $aspect="square"
              $size="md"
            >
              <LucideChevronLeft class="h-6 w-6 text-(--lv-text-muted) rtl:rotate-180" />
            </Button>
          )
        : (
            <Button
              type="button"
              onClick={() => properties.setView("info")}
              $variant="tertiary"
              $aspect="square"
              $size="md"
            >
              <LucideCircleQuestionMark class="h-5 w-5" />
            </Button>
          )}
      <h2 class="flex items-center justify-center gap-2 font-semibold text-(--lv-text-primary) text-lg">
        {properties.title}
      </h2>
      <Button
        type="button"
        aria-label={String(t("common.close"))}
        aria-pressed={false}
        onClick={properties.onClose}
        $variant="tertiary"
        $aspect="square"
        $size="md"
      >
        <LucideX class="h-6 w-6 text-(--lv-text-muted)" />
      </Button>
    </div>
  );
};

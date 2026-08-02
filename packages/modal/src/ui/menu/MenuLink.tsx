import { LucideChevronRight } from "lucide-solid";
import { type JSX, Show } from "solid-js";

export type MenuLinkProps = {
  label: JSX.Element;
  value?: JSX.Element;
  onClick: () => void;
};

export const MenuLink = (properties: MenuLinkProps) => (
  <button
    type="button"
    onClick={properties.onClick}
    class="flex w-full cursor-pointer items-center justify-between gap-2 first:rounded-t-sm last:rounded-b-sm px-2 py-1 first:pt-1.5 last:pb-2 hover:bg-(--lv-control-button-tertiary-hoverBackground)"
  >
    <div class="text-sm text-(--lv-text-secondary) flex items-center gap-1">
      {properties.label}
    </div>
    <div class="flex items-center gap-1">
      <Show when={properties.value}>
        <span class="text-sm text-(--lv-text-muted)">{properties.value}</span>
      </Show>
      <LucideChevronRight class="h-4 w-4 text-(--lv-text-muted) rtl:rotate-180" />
    </div>
  </button>
);

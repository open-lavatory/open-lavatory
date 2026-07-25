import type { JSX, ParentProps } from "solid-js";

export type MenuItemProps = ParentProps<{
  label: JSX.Element;
}>;

export const MenuItem = (properties: MenuItemProps) => (
  <div class="flex items-baseline justify-between gap-2 px-2 py-1 first:pt-2 last:pb-2">
    <div class="text-sm text-(--lv-text-secondary) text-start">
      {properties.label}
    </div>
    <div>{properties.children}</div>
  </div>
);

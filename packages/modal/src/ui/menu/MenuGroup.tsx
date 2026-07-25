import type { JSX, ParentProps } from "solid-js";

export type MenuGroupProps = ParentProps<{
  title: JSX.Element;
  right?: JSX.Element;
}>;

export const MenuGroup = (properties: MenuGroupProps) => (
  <div>
    <div class="flex items-end justify-between py-1 pl-2">
      <div class="font-medium text-(--lv-text-primary) text-sm">
        {properties.title}
      </div>
      <div>{properties.right}</div>
    </div>
    <div class="flex flex-col gap-1 rounded-md bg-(--lv-card-background)">
      {properties.children}
    </div>
  </div>
);

import { LucideCircleQuestionMark } from "lucide-solid";
import { mergeProps, type ParentProps } from "solid-js";
import type { VariantProps } from "tailwind-variants/lite";
import { tv } from "tailwind-variants/lite";
import { match } from "ts-pattern";

const styles = tv({
  slots: {
    root: "group relative",
    box: "cursor-pointer rounded-md transition-colors flex items-center justify-center hover:[background-color:var(--lv-control-button-tertiary-hoverBackground)] text-(--lv-text-muted)",
    popover:
      "-translate-x-1/2 absolute top-full left-1/2 z-10 hidden rounded-md shadow-sm group-hover:block border border-(--lv-control-button-secondary-border) bg-(--lv-body-background) px-2 py-1.5 text-(--lv-text-primary) text-sm",
    icon: "",
  },
  variants: {
    size: {
      sm: {
        box: "h-5 w-5 p-1",
        icon: "h-3 w-3",
      },
      md: {
        box: "h-6 w-6 p-1",
        icon: "h-4 w-4",
      },
      lg: {
        box: "h-8 w-8 p-1.5",
        icon: "h-4 w-4",
      },
    },
    variant: {
      icon: "",
      text: "",
    },
  },
  defaultVariants: {
    size: "lg",
  },
});

export type InfoTooltipProps = VariantProps<typeof styles>;

export const InfoTooltip = (rawProperties: ParentProps<InfoTooltipProps>) => {
  const properties = mergeProps(
    { variant: "icon" as const, size: "lg" as const },
    rawProperties,
  );
  const { root, box, popover, icon } = styles({
    size: properties.size,
    variant: properties.variant,
  });

  return (
    <div class={root()}>
      <div class={box()}>
        {match(properties.variant)
          .with("icon", () => <LucideCircleQuestionMark class={icon()} />)
          .with("text", () => <div>Text</div>)
          .exhaustive()}
      </div>
      <div class={popover()}>{properties.children}</div>
    </div>
  );
};

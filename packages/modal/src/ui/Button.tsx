// Button implementation that also supports being an anchor tag
import classNames from "classnames";
import { type JSX, splitProps } from "solid-js";
import { tv, type VariantProps } from "tailwind-variants/lite";

const styles = tv({
  base: "flex items-center justify-center rounded-lg transition-all duration-100 cursor-pointer active:scale-95",
  variants: {
    $variant: {
      primary:
        "font-semibold text-sm bg-(--lv-control-button-primary-background) text-(--lv-control-button-primary-color) border-(--lv-control-button-primary-border) hover:bg-(--lv-control-button-primary-hoverBackground,var(--lv-control-button-primary-background)) active:bg-(--lv-control-button-primary-activeBackground,var(--lv-control-button-primary-hoverBackground,var(--lv-control-button-primary-background))) disabled:bg-(--lv-control-button-primary-disabledBackground,var(--lv-control-button-primary-background)) disabled:text-(--lv-control-button-primary-disabledColor,var(--lv-control-button-primary-color))",
      secondary:
        "border bg-(--lv-control-button-secondary-background) text-(--lv-control-button-secondary-color) border-(--lv-control-button-secondary-border,var(--lv-control-button-secondary-background)) hover:bg-(--lv-control-button-secondary-hoverBackground,var(--lv-control-button-secondary-background)) active:bg-(--lv-control-button-secondary-activeBackground,var(--lv-control-button-secondary-hoverBackground,var(--lv-control-button-secondary-background))) disabled:bg-(--lv-control-button-secondary-disabledBackground,var(--lv-control-button-secondary-background)) disabled:text-(--lv-control-button-secondary-disabledColor,var(--lv-control-button-secondary-color))",
      tertiary:
        "bg-transparent text-(--lv-text-muted) hover:bg-(--lv-control-button-tertiary-hoverBackground,transparent) active:bg-(--lv-control-button-tertiary-activeBackground,var(--lv-control-button-tertiary-hoverBackground,transparent)) disabled:text-(--lv-control-button-tertiary-disabledColor,var(--lv-text-muted))",
    },
    $size: {
      sm: "h-6",
      md: "h-8",
      lg: "h-11",
    },
    $aspect: {
      square: "aspect-square",
      auto: "",
    },
  },
  defaultVariants: {
    $size: "md",
    $variant: "primary",
    $aspect: "auto",
  },
});

export type ButtonButtonProps = {
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
} & JSX.ButtonHTMLAttributes<HTMLButtonElement>;
export type ButtonLinkProps = {
  href: string;
  onClick?: JSX.EventHandlerUnion<HTMLAnchorElement, MouseEvent>;
} & JSX.AnchorHTMLAttributes<HTMLAnchorElement>;
export type ButtonProps = {
  children?: JSX.Element;
  class?: string;
} & VariantProps<typeof styles>
& (
    | ({
      href: string;
    } & ButtonLinkProps)
    | ({
      href?: undefined;
    } & ButtonButtonProps)
  );

export const Button = (rawProperties: ButtonProps) => {
  const [local, properties] = splitProps(rawProperties, [
    "children",
    "class",
    "$variant",
    "$size",
    "$aspect",
    "href",
    "onClick",
  ]);

  if (local.href) {
    return (
      <a
        href={local.href}
        onClick={
          local.onClick as JSX.EventHandlerUnion<HTMLAnchorElement, MouseEvent>
        }
        class={classNames(
          styles({
            $variant: local.$variant,
            $size: local.$size,
            $aspect: local.$aspect,
          }),
          local.class,
        )}
        {...(properties as JSX.AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {local.children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={
        local.onClick as JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>
      }
      class={classNames(
        styles({
          $variant: local.$variant,
          $size: local.$size,
          $aspect: local.$aspect,
        }),
        local.class,
      )}
      {...(properties as JSX.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {local.children}
    </button>
  );
};

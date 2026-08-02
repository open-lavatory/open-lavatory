import { For, Show } from "solid-js";
import { tv } from "tailwind-variants/lite";

const buttonGroupStyles = tv({
  slots: {
    root: "flex overflow-hidden rounded-md border border-(--lv-control-button-secondary-border)",
    box: "px-4 py-2 font-semibold text-xs transition border-l first:border-l-0 border-(--lv-control-button-secondary-border)",
  },
  variants: {
    active: {
      on: {
        box: "bg-(--lv-control-button-secondary-background) text-(--lv-text-primary)",
      },
      off: {
        box: "bg-transparent text-(--lv-text-secondary) cursor-pointer",
      },
    },
  },
  defaultVariants: {
    active: "off",
  },
});

const dropdownStyles = tv({
  base: "w-full rounded-md border border-(--lv-control-button-secondary-border) bg-(--lv-control-button-secondary-background) px-3 py-2 font-semibold text-xs text-(--lv-text-primary) cursor-pointer focus:outline-none focus:ring-2 focus:ring-(--lv-control-button-primary-background) appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2214%22%20height%3D%2214%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px] bg-[right_8px_center] bg-no-repeat pr-8",
});

export type SelectProps = {
  options: string[][];
  value: string;
  onChange: (value: string) => void;
  dropdownThreshold?: number;
};

export const Select = (properties: SelectProps) => {
  const dropdown = dropdownStyles();
  const { root, box } = buttonGroupStyles({});

  return (
    <Show
      when={properties.options.length > (properties.dropdownThreshold ?? 3)}
      fallback={(
        <div class={root()}>
          <For each={properties.options}>
            {([slug, label]) => (
              <button
                type="button"
                onClick={() => properties.onChange(slug)}
                aria-pressed={slug === properties.value}
                class={box({ active: slug === properties.value ? "on" : "off" })}
              >
                {label}
              </button>
            )}
          </For>
        </div>
      )}
    >
      <select
        class={dropdown}
        value={properties.value}
        onChange={event => properties.onChange(event.currentTarget.value)}
      >
        <For each={properties.options}>
          {([slug, label]) => <option value={slug}>{label}</option>}
        </For>
      </select>
    </Show>
  );
};

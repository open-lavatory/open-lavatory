import { Index, mergeProps, splitProps } from "solid-js";

const labelClasses = "font-semibold text-xs uppercase tracking-wide";
const inputClasses
  = "h-9 w-full rounded-lg border bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 text-(--lv-text-primary) bg-(--lv-body-background) border-(--lv-control-input-border)";

type LabelProperties = {
  htmlFor?: string;
  children: string;
};

export const Label = (properties: LabelProperties) => (
  <label
    class={`${labelClasses} text-(--lv-text-secondary)`}
    for={properties.htmlFor}
  >
    {properties.children}
  </label>
);

type InputProperties = {
  // eslint-disable-next-line no-restricted-syntax
  id?: string;
  value: string;
  placeholder?: string;
  ariaLabel?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
};

export const Input = (properties: InputProperties) => {
  const merged = mergeProps({ readOnly: true }, properties);
  const [local] = splitProps(merged, [
    "id",
    "value",
    "placeholder",
    "ariaLabel",
    "readOnly",
    "onChange",
  ]);

  return (
    <input
      // eslint-disable-next-line no-restricted-syntax
      id={local.id}
      class={inputClasses}
      value={local.value}
      placeholder={local.placeholder}
      aria-label={local.ariaLabel}
      readOnly={local.readOnly}
      onInput={(event) => {
        local.onChange?.(event.currentTarget.value);
      }}
    />
  );
};

type InputGroupProperties = {
  label: string;
  values: readonly string[];
  placeholder?: string;
  inputIdPrefix?: string;
};

export const InputGroup = (properties: InputGroupProperties) => (
  <div class="grid gap-2">
    <Label>{properties.label}</Label>
    <Index each={properties.values}>
      {(value, index) => {
        const inputId = properties.inputIdPrefix
          ? `${properties.inputIdPrefix}-${index}`
          : undefined;
        const suffix = properties.values.length > 1 ? ` ${index + 1}` : "";

        return (
          <Input
            id={inputId}
            value={value()}
            placeholder={properties.placeholder}
            ariaLabel={`${properties.label}${suffix}`}
          />
        );
      }}
    </Index>
  </div>
);

import classNames from "classnames";
import { type JSX, Show } from "solid-js";

export type TransitionContainerProps<T> = {
  current: T;
  previous: T | undefined;
  isTransitioning: boolean;
  render: (value: T) => JSX.Element;
  class?: string;
};

export const TransitionContainer = <T = unknown>(
  properties: TransitionContainerProps<T>,
) => (
  <div class={classNames("modal-transition__container", properties.class)}>
    <Show when={properties.previous !== undefined}>
      <div class="modal-transition__layer modal-transition__layer--outgoing">
        {properties.render(properties.previous as T)}
      </div>
    </Show>
    <div
      class={classNames(
        "modal-transition__layer",
        properties.isTransitioning && "modal-transition__layer--incoming",
      )}
    >
      {properties.render(properties.current)}
    </div>
  </div>
);

import { For } from "solid-js";

const dotCount = (isApple: boolean) => (isApple ? 1 : 3);

const TabletGraphic = (properties: { isApple: boolean; }) => (
  <div class="flex h-full w-full justify-between">
    <div class="grow py-1 ps-1">
      <div class="h-full rounded-sm border border-gray-300 bg-gray-400"></div>
    </div>
    <div class="flex h-full w-3 flex-col items-center justify-center gap-0.5 pr-0.5">
      <For each={Array.from({ length: dotCount(properties.isApple) })}>
        {() => (
          <div class="h-1.5 w-1.5 rounded-full border border-gray-500"></div>
        )}
      </For>
    </div>
  </div>
);

const PhoneGraphic = (properties: { isApple: boolean; }) => (
  <div class="flex h-full w-full flex-col justify-between">
    <div class="grow px-1 pt-1">
      <div class="h-full rounded-sm border border-gray-200 bg-gray-300"></div>
    </div>
    <div class="flex h-3 w-full items-center justify-center gap-0.5 pb-0.5">
      <For each={Array.from({ length: dotCount(properties.isApple) })}>
        {() => (
          <div class="h-1.5 w-1.5 rounded-full border border-gray-400"></div>
        )}
      </For>
    </div>
  </div>
);

export const ConnectionGraphic = () => {
  // the only fingerprinting we ever do
  // is Apple device
  //   const isApple =
  //     navigator.userAgent.includes("iPhone") ||
  //     navigator.userAgent.includes("iPad") ||
  //     navigator.userAgent.includes("iPod");
  const isApple = true;

  return (
    <div class="-space-x-4 flex items-end">
      <div class="h-38 w-48 overflow-hidden rounded-lg bg-gray-300">
        <TabletGraphic isApple={isApple} />
      </div>
      <div class="h-18 w-12 overflow-hidden rounded-lg bg-gray-200">
        <PhoneGraphic isApple={isApple} />
      </div>
    </div>
  );
};

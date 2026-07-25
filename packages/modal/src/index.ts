
/** biome-ignore-all lint/performance/noBarrelFile: package entrypoint */
/** biome-ignore-all lint/performance/noReExportAll: package entrypoint */
/** biome-ignore-all lint/suspicious/noConsole: temp */

export { ModalRoot } from "./components/ModalRoot.js";
export { default, OpenLVModalElement, type OpenLVModalElementProperties } from "./element.js";
export type { ThemeConfig } from "./theme/index.js";

import OpenLVModalElementDefault, {
  type OpenLVModalElementProperties,
} from "./element.js";
import { log } from "./utils/log.js";
export { OPENLV_ICON_128 } from "./assets/logo.js";

export const registerOpenLVModal = (tagName = "openlv-modal") => {
  if (globalThis.window === undefined) {
    return tagName;
  }

  const registry = globalThis.customElements;

  if (!registry) {
    console.warn(
      "OpenLV modal: custom elements are not supported in this environment.",
    );

    return tagName;
  }

  if (!registry.get(tagName)) {
    registry.define(
      tagName,
      OpenLVModalElementDefault as unknown as CustomElementConstructor,
    );
  }

  return tagName;
};

export const triggerOpenModal = (properties: OpenLVModalElementProperties) => {
  const modal = document.querySelector("openlv-modal");

  if (modal) modal.remove();

  if (!modal) {
    registerOpenLVModal();
    const x = new OpenLVModalElementDefault({
      onClose() {
        log("modal closed");
        x.remove();
        properties.onClose?.();
      },
      provider: properties.provider,
      theme: properties.theme,
    });

    document.body.append(x);
    // x.showModal();
  }
};

export type TriggerOpenModal = typeof triggerOpenModal;

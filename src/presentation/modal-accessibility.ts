export interface ModalAccessibility {
  announce(message: string): void;
  cleanup(): void;
}

export function createModalAccessibility(
  document: Document,
  cancel: () => void,
): ModalAccessibility {
  const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const region = document.createElement("div");
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-atomic", "true");
  region.style.position = "absolute";
  region.style.width = "1px";
  region.style.height = "1px";
  region.style.overflow = "hidden";
  region.style.clipPath = "inset(50%)";
  document.body.append(region);
  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };
  document.defaultView?.addEventListener("keydown", handleEscape);
  return {
    announce(message) {
      region.textContent = message;
    },
    cleanup() {
      document.defaultView?.removeEventListener("keydown", handleEscape);
      region.remove();
      priorFocus?.focus();
    },
  };
}

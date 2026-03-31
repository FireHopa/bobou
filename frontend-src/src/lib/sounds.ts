let enabled = false;
const click = new Audio("/sounds/click.mp3");

export function toggleSounds(v?: boolean) {
  enabled = typeof v === "boolean" ? v : !enabled;
}

export function playClick() {
  if (enabled) click.play().catch(()=>{});
}

import { useSession } from "../hooks/useSession.js";

export const UnknownState = (properties: { state: unknown; }) => {
  const { uri, status } = useSession();

  console.error("Unknown state:", {
    state: properties.state,
  });

  return (
    <div class="rounded-md bg-(--lv-control-button-secondary-background) p-2 text-(--lv-text-muted)">
      <div>
        Unknown state:
        {JSON.stringify(properties.state)}
      </div>
      <div>
        URI:
        {uri()}
      </div>
      <div>
        Session Status:
        {JSON.stringify(status())}
      </div>
    </div>
  );
};

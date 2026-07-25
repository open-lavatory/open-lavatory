/* eslint-disable @typescript-eslint/no-unused-vars */
import { EnterFullScreenIcon } from "@radix-ui/react-icons";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Dialog } from "radix-ui";
import { useState } from "react";

import { LoadingSVG } from "./LoadingSVG";
import styles from "./QRScanner.module.css";

type State = {
  isConnecting: boolean;
  uri: string | null;
};

const Title = ({ isConnecting, uri }: State) => {
  if (!uri) return "Show the QR code";

  if (isConnecting && uri) return "Establishing session";

  if (!isConnecting && uri) return "Invalid URI";

  return "Connected";
};

const Body = ({
  isConnecting,
  uri,
  setIsConnecting,
  setUri,
}: State & {
  setIsConnecting: (isConnecting: boolean) => void;
  setUri: (uri: string) => void;
}) => {
  if (!isConnecting && !uri) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();

          setUri(new FormData(e.currentTarget).get("uri") as string);
          setIsConnecting(true);
        }}
      >
        <Scanner
          sound={false}
          onScan={(result) => {
            if (result[0].format !== "qr_code") {
              return;
            }

            setUri(result[0].rawValue);
            setIsConnecting(true);
          }}
        />
        {!isConnecting && (
          <input
            name="uri"
            className={styles.input}
            placeholder="openlv://<uuid>"
          />
        )}
      </form>
    );
  }

  if (isConnecting && uri) {
    return (
      <div className={styles.loader}>
        <LoadingSVG height={36} width={36} />
      </div>
    );
  }
};

const SessionDialog = ({ setOpen }: { setOpen: (open: boolean) => void; }) => {
  const [uri, setUri] = useState<string | null>(null);

  const [isConnecting, setIsConnecting] = useState(false);

  return (
    <Dialog.Content className={styles.content}>
      <Dialog.Title className={styles.title}>
        <Title {...{ uri, isConnecting }} />
      </Dialog.Title>
      <Body {...{ uri, isConnecting, setUri, setIsConnecting }} />
    </Dialog.Content>
  );
};

export const QRScanner = () => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className={styles.cta}>
          <EnterFullScreenIcon />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <SessionDialog setOpen={setOpen} />
      </Dialog.Portal>
    </Dialog.Root>
  );
};

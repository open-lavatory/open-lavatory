import styles from "./App.module.css";
import { QRScanner } from "./components/QRScanner";
import { WalletInfo } from "./components/WalletInfo";

export const App = () => (
  <>
    <header className={styles.header}>
      <span>"ldquo;"obile"ldquo; Wallet</span>
      <QRScanner />
    </header>
    <WalletInfo />
  </>
);

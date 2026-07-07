import React from "react";
import { LogoMark, Wordmark } from "./Logo";
import { GitHubLink } from "./GitHubLink";
import type { WalletState } from "../lib/wallet";
import { shortAddr } from "../lib/contract";

type Route = "docs" | "console" | "archive";

interface HeaderProps {
  route: Route;
  onNavigate: (r: Route) => void;
  wallet: WalletState;
}

export function Header({ route, onNavigate, wallet }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="container">
        <a
          className="brand"
          href="#/docs"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("docs");
          }}
        >
          <LogoMark />
          <Wordmark />
        </a>
        <nav className="nav">
          <a
            href="#/docs"
            className={route === "docs" ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              onNavigate("docs");
            }}
          >
            Documentation
          </a>
          <a
            href="#/console"
            className={route === "console" ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              onNavigate("console");
            }}
          >
            File a case
          </a>
          <a
            href="#/archive"
            className={route === "archive" ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              onNavigate("archive");
            }}
          >
            Verdict archive
          </a>
        </nav>
        <div className="wallet">
          <GitHubLink variant="icon" size={18} />
          <WalletButton wallet={wallet} />
        </div>
      </div>
    </header>
  );
}

function WalletButton({ wallet }: { wallet: WalletState }) {
  if (!wallet.isConnected) {
    return (
      <button
        className="btn small"
        disabled={wallet.isConnecting}
        onClick={() => wallet.connect()}
      >
        {wallet.isConnecting ? "Connecting..." : "Connect wallet"}
      </button>
    );
  }

  return (
    <>
      {!wallet.onCorrectChain && (
        <button
          className="btn small danger"
          onClick={() => wallet.switchToBradbury()}
          title="Switch your wallet to the GenLayer Bradbury testnet."
        >
          Switch to Bradbury
        </button>
      )}
      <span className={`chip ${wallet.onCorrectChain ? "ok" : ""}`} title={wallet.address ?? ""}>
        <span className="dot" />
        {shortAddr(wallet.address ?? "")}
      </span>
      <button className="btn small ghost" onClick={() => wallet.disconnect()}>
        Disconnect
      </button>
    </>
  );
}

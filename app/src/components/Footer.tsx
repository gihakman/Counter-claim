import React from "react";
import { LogoMark } from "./Logo";
import { GitHubLink, REPO_URL } from "./GitHubLink";
import {
  BRADBURY_EXPLORER,
  DEFAULT_CONTRACT_ADDRESS,
  explorerAddress,
} from "../lib/config";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          <LogoMark size={28} />
          <div className="colophon">
            Counterclaim publishes structured, validator-issued verdicts on
            algorithmic decisions. Verdicts live on the GenLayer Bradbury
            testnet. This service is not legal advice.
          </div>
        </div>

        <div className="cols">
          <div>
            <h4>Product</h4>
            <ul>
              <li>
                <a href="#/docs">Documentation</a>
              </li>
              <li>
                <a href="#/console">File a case</a>
              </li>
              <li>
                <a href="#/archive">Verdict archive</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>On-chain</h4>
            <ul>
              <li>
                <a
                  href={explorerAddress(DEFAULT_CONTRACT_ADDRESS)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Contract
                </a>
              </li>
              <li>
                <a href={BRADBURY_EXPLORER} target="_blank" rel="noreferrer">
                  Bradbury explorer
                </a>
              </li>
              <li>
                <a
                  href="https://testnet-faucet.genlayer.foundation/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Bradbury faucet
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4>GenLayer</h4>
            <ul>
              <li>
                <a
                  href="https://docs.genlayer.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Protocol docs
                </a>
              </li>
              <li>
                <a
                  href="https://portal.genlayer.foundation/#/builders/resources"
                  target="_blank"
                  rel="noreferrer"
                >
                  Builder resources
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/genlayerlabs"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Source</h4>
            <ul>
              <li>
                <GitHubLink variant="text" size={16} />
              </li>
              <li>
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  Report an issue
                </a>
              </li>
              <li>
                <a
                  href={`${REPO_URL}/blob/main/README.md`}
                  target="_blank"
                  rel="noreferrer"
                >
                  README
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}

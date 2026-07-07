import React, { useCallback, useEffect, useState } from "react";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Docs } from "./pages/Docs";
import { ConsolePage } from "./pages/Console";
import { Archive } from "./pages/Archive";
import { useWallet } from "./lib/wallet";
import {
  fetchFeeConfig,
  fetchTotalCases,
  type FeeConfig,
} from "./lib/contract";

type Route = "docs" | "console" | "archive";

function parseRoute(): Route {
  const h = (typeof window !== "undefined" && window.location.hash) || "";
  const path = h.replace(/^#\/?/, "").split(/[/?]/)[0] || "docs";
  if (path === "console") return "console";
  if (path === "archive") return "archive";
  return "docs";
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [feeConfig, setFeeConfig] = useState<FeeConfig | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const wallet = useWallet();

  const navigate = useCallback((r: Route) => {
    setRoute(r);
    if (typeof window !== "undefined") {
      window.location.hash = `#/${r}`;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Load fee config + total cases up-front. Deliberately no read-burst: one
  // fee_config, one total_cases, then per-page requests happen on demand.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [fc, tc] = await Promise.all([fetchFeeConfig(), fetchTotalCases()]);
        if (cancelled) return;
        setFeeConfig(fc);
        setTotal(tc);
      } catch (err) {
        console.warn("initial read failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <>
      <Header route={route} onNavigate={navigate} wallet={wallet} />

      <main>
        {route === "docs" && (
          <Docs
            cases={total}
            onFileCase={() => navigate("console")}
            onViewArchive={() => navigate("archive")}
          />
        )}
        {route === "console" && (
          <ConsolePage
            wallet={wallet}
            feeConfig={feeConfig}
            onFiled={() => {
              triggerRefresh();
            }}
          />
        )}
        {route === "archive" && (
          <Archive
            wallet={wallet}
            refreshKey={refreshKey}
            onRefresh={triggerRefresh}
          />
        )}
      </main>

      <Footer />
    </>
  );
}

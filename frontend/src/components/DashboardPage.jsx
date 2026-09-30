import React from "react";
import SettingsDropdown from "./SettingsDropdown";
import "../styles/DashboardPage.css";

const EVIDENCE = [
  {
    source: "Council meeting minutes",
    type: "Primary source",
    finding: "Records a 4% increase, not 40%.",
    stance: "contradicts",
    label: "Contradicts the figure",
  },
  {
    source: "Local newspaper report",
    type: "Independent coverage",
    finding: "Confirms fares rose and gives the same 4% figure.",
    stance: "supports",
    label: "Supports the increase",
  },
  {
    source: "Transit agency fare table",
    type: "Supporting evidence",
    finding: "New fare amounts match a 4% rise.",
    stance: "supports",
    label: "Supports the increase",
  },
];

const VERDICTS = [
  {
    key: "supported",
    symbol: "✓",
    name: "Supported",
    text: "Reliable sources agree with the claim.",
  },
  {
    key: "partial",
    symbol: "~",
    name: "Partly supported",
    text: "Some of the claim holds, but details are wrong or missing.",
  },
  {
    key: "unsupported",
    symbol: "✕",
    name: "Not supported",
    text: "Reliable sources contradict the claim.",
  },
  {
    key: "unverifiable",
    symbol: "?",
    name: "Unverifiable",
    text: "There is not enough reliable evidence to decide.",
  },
];

const DashboardPage = ({
  onTryAura,
  onOpenAuth,
  user,
  authenticated,
  onProfile,
  onSettings,
  onHelp,
  onLogout,
}) => {
  const displayName = user?.name?.trim();

  return (
    <div className="dashboard">
      <a className="dashboard__skip-link" href="#dashboard-main">
        Skip to main content
      </a>

      <header className="dashboard-header">
        <nav className="dashboard-header__inner" aria-label="Primary navigation">
          <a className="dashboard-brand" href="/" aria-label="Aura AI home">
            <span className="dashboard-brand__mark" aria-hidden="true">
              <img src="/aura_ai.png" alt="" />
            </span>
            <span className="dashboard-brand__name">Aura AI</span>
          </a>

          <div className="dashboard-header__actions">
            {authenticated ? (
              <SettingsDropdown
                user={user}
                onProfile={onProfile}
                onSettings={onSettings}
                onHelp={onHelp}
                onLogout={onLogout}
              />
            ) : (
              <>
                <button
                  className="dashboard-button dashboard-button--text"
                  type="button"
                  onClick={onTryAura}
                >
                  Try Aura
                </button>
                <button
                  className="dashboard-button dashboard-button--outline"
                  type="button"
                  onClick={onOpenAuth}
                >
                  Log in / Sign up
                </button>
              </>
            )}
          </div>
        </nav>
      </header>

      <main id="dashboard-main" className="dashboard-main">
        <section className="dashboard-hero" aria-labelledby="dashboard-title">
          <div className="dashboard-hero__content">
            <h1 className="dashboard-hero__title" id="dashboard-title">
              {authenticated && displayName
                ? `Welcome back, ${displayName}.`
                : "Check a claim before you share it."}
            </h1>

            <p className="dashboard-hero__description">
              Aura AI looks up what reliable sources say about a claim and
              shows you the evidence behind its verdict.
            </p>

            <div className="dashboard-hero__actions">
              <button
                className="dashboard-button dashboard-button--primary dashboard-button--lg"
                type="button"
                onClick={onTryAura}
              >
                Check a claim
              </button>

              {!authenticated && (
                <button
                  className="dashboard-button dashboard-button--outline dashboard-button--lg"
                  type="button"
                  onClick={onOpenAuth}
                >
                  Log in / Sign up
                </button>
              )}
            </div>
          </div>

          <aside className="dashboard-sheet" aria-labelledby="dashboard-sheet-title">
            <div className="dashboard-sheet__header">
              <h2 className="dashboard-sheet__title" id="dashboard-sheet-title">
                Example check
              </h2>
              <span className="dashboard-sheet__note">Illustrative, not a real result</span>
            </div>

            <blockquote className="dashboard-sheet__claim">
              The city council <mark>raised bus fares by 40%</mark> last month.
            </blockquote>

            <p className="dashboard-sheet__verdict dashboard-verdict dashboard-verdict--partial">
              <span className="dashboard-verdict__symbol" aria-hidden="true">~</span>
              <span>
                <strong>Partly supported.</strong> Fares rose, but by 4%.
              </span>
            </p>

            <h3 className="dashboard-sheet__subtitle">Evidence reviewed</h3>
            <ol className="dashboard-ledger">
              {EVIDENCE.map((item) => (
                <li className="dashboard-ledger__item" key={item.source}>
                  <div className="dashboard-ledger__source">
                    <span className="dashboard-ledger__name">{item.source}</span>
                    <span className="dashboard-ledger__type">{item.type}</span>
                  </div>
                  <p className="dashboard-ledger__finding">{item.finding}</p>
                  <span
                    className={`dashboard-ledger__stance dashboard-ledger__stance--${item.stance}`}
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </section>
      </main>
    </div>
  );
};

export default DashboardPage;
# Interface recreation

The visual reference is Pump.fun's public Explore, create and coin interfaces, inspected on 21 October 2026. Decompiled Pump keeps its own name, original SVG mark, independent-program identity and explicit devnet labels.

The interface uses a narrow collapsible icon rail, persistent search with a keyboard shortcut, a mint-green accent, compact market cards, grid/table views and a local watchlist. Home groups genuine coin accounts by protocol stage. The create page has paired name/ticker fields, optional description/socials/initial buy, an image drop zone, and a live preview. The coin page puts the chart and recent-trades table beside compact buy/sell controls, quotes, slippage, fees and creator rewards. Price and inferred market-cap chart views use actual recent fills.

Only supported protocol data is displayed. No copied Pump listings, fabricated volume, percentage returns, holder counts, callouts, or leaderboard activity are inserted to fill the interface. There are no livestream, cross-chain, holder-rewards, or Pump transaction routes. The independent program and its economic rules are unchanged by the visual recreation.

Geist is served from this site's own assets using the unmodified official open-source font and its accompanying license. The palette and typography were checked against the visible reference. No Pump logo, coin artwork or frontend source was copied.

Listings share an in-flight request and a 15-second cache across navigation. Refresh explicitly refetches. RPC requests have a 12-second timeout and one bounded retry on HTTP 429. Chart history shares pending requests and is cached separately for 60 seconds after success, with an explicit refresh. These controls reduce redundant requests without adding paid services.

Browser verification covers desktop rendering and the 390-pixel CSS layout in a same-origin iframe. This checks responsive layout, not physical-device Safari or Android behavior. Actual extension-wallet approval remains a separate validation limit. Precise checks are recorded in `research/ui-checks.json`.

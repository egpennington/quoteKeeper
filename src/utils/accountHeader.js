// Which app views show the account header ("Signed in as … / Sign out").
// Only the main QuoteKeeper screen does. SmartScan and Q Library are
// full-height working views, so the header is not rendered there. This only
// affects rendering; the signed-in session is unchanged.
export const showsAccountHeader = (view) => view === 'form';

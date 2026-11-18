// Layout tokens for the search form. Every field has the same three rows — label, control and
// a reserved message line — so hints and validation errors never push controls out of line.
export const form =
  "card-surface grid grid-cols-1 gap-x-4 gap-y-1 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_auto] xl:items-start";
export const field = "flex min-w-0 flex-col";
export const label = "flex h-6 items-center text-sm font-medium leading-none";
/** Same height, radius and background for inputs and select triggers. */
export const control = "h-10 rounded-lg bg-background";
/** Reserved space for one line of hint/error text (prevents vertical jumps). */
export const message = "min-h-5 pt-1 text-xs leading-4";
export const hint = "text-muted-foreground";
export const error = "font-medium text-destructive";
export const actions = "flex min-w-0 flex-col sm:col-span-2 xl:col-span-1";
export const actionsSpacer = "hidden h-6 xl:block";
export const button = "h-10 w-full xl:w-auto xl:min-w-28";
export const suggestions = "flex flex-wrap gap-2 pt-1 sm:col-span-2 xl:col-span-5";
export const chip =
  "rounded-full border border-border bg-background px-3 py-1 text-xs font-medium transition-colors hover:border-primary hover:bg-accent";

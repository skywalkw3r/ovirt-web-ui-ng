// The Events page shipped this hook first; the behavior now lives in
// useListSearch (the same committed-?q= pattern rolled onto every list page).
// Kept as a re-export so EventsPage keeps its original import and the
// behavior stays single-sourced.
export { useListSearch as useEventSearch } from './useListSearch'
